// Deep Research Phase 11 — Enterprise Capture Governance Center aggregator.
//
// Read-only composite over every Phase 11 surface — feeds the
// /admin/deep-research/governance page.

const { Op } = require('sequelize');
const {
  SlaEvent, WorkflowAssignment, AuditEvent, EventLineage,
  GovernanceEvent, TenantSettings,
} = require('../models');

const tenantIsolation = require('./tenantIsolation.service');
const auditTrail = require('./auditTrail.service');
const eventLineage = require('./eventLineage.service');
const slaEscalation = require('./slaEscalation.service');
const workflowGovernance = require('./workflowGovernance.service');
const storageProviders = require('./storageProviders.service');
const observabilityStream = require('./observabilityStream.service');

async function tenantHealth(orgId) {
  const summary = await tenantIsolation.summarizeTenant(orgId);
  return summary;
}

async function slaEscalations(orgId) {
  const where = {};
  if (orgId != null) where.organizationId = Number(orgId);

  const open = await SlaEvent.count({ where: { ...where, status: 'open' } });
  const ack = await SlaEvent.count({ where: { ...where, status: 'acknowledged' } });
  const escalated = await SlaEvent.count({
    where: { ...where, severity: { [Op.gte]: 80 }, status: { [Op.in]: ['open', 'acknowledged'] } },
  });
  const topSeverity = await SlaEvent.findAll({
    where: { ...where, status: { [Op.in]: ['open', 'acknowledged'] } },
    order: [['severity', 'DESC']], limit: 10,
  });
  return {
    open, acknowledged: ack, escalated,
    top_severity_sample: topSeverity.map((r) => r.toJSON()),
  };
}

async function operatorWorkloads(orgId) {
  return workflowGovernance.workloadByOperator({ organizationId: orgId });
}

async function auditTimeline(orgId, { limit = 30 } = {}) {
  return auditTrail.recent({ organizationId: orgId, limit });
}

async function workflowBottlenecks(orgId) {
  return workflowGovernance.detectBottlenecks({ organizationId: orgId });
}

async function approvalAgingChart(orgId) {
  return workflowGovernance.approvalAging({ organizationId: orgId, agingDays: 2 });
}

async function queueGovernance(orgId) {
  return workflowGovernance.summarize({ organizationId: orgId });
}

async function storageGovernance(orgId) {
  const [health, migration] = await Promise.all([
    storageProviders.providerHealth(),
    storageProviders.migrationStatus({ organizationId: orgId }),
  ]);
  return { health, migration };
}

async function streamHealth() {
  return observabilityStream.summarize();
}

async function lineageOverview(orgId) {
  return eventLineage.summarize({ organizationId: orgId });
}

async function governanceEventsRecent(orgId, { limit = 20 } = {}) {
  const where = {};
  if (orgId != null) where.organizationId = Number(orgId);
  const rows = await GovernanceEvent.findAll({
    where, order: [['created_at', 'DESC']], limit,
  });
  return rows.map((r) => r.toJSON());
}

// Tenant pressure indicator — composite score that weighs SLA + workload +
// stuck-approvals + failing-streams. 0 = healthy, 100 = on-fire.
async function tenantPressureIndicator(orgId) {
  const [sla, wf, wfBottle, streams] = await Promise.all([
    slaEscalations(orgId),
    workflowGovernance.summarize({ organizationId: orgId }),
    workflowGovernance.detectBottlenecks({ organizationId: orgId }),
    Promise.resolve(observabilityStream.summarize()),
  ]);
  let score = 0;
  score += Math.min(40, sla.open * 4);
  score += Math.min(15, sla.escalated * 5);
  score += Math.min(20, wf.overdue * 4);
  score += Math.min(15, Math.max(0, ...(wfBottle.map((b) => b.avg_age_days || 0))));
  if (streams.active >= streams.max * 0.9) score += 10;
  score = Math.min(100, Math.round(score));
  const status = score >= 70 ? 'critical' : score >= 40 ? 'elevated' : score >= 20 ? 'watch' : 'healthy';
  return {
    pressure_score: score,
    status,
    breakdown: {
      open_sla: sla.open,
      escalated_sla: sla.escalated,
      overdue_workflow: wf.overdue,
      top_bottleneck_avg_days: Math.max(0, ...(wfBottle.map((b) => b.avg_age_days || 0))),
    },
  };
}

async function getGovernance(orgId) {
  const [tenant, sla, workloads, audit, bottlenecks, aging, queueGov,
    storage, streams, lineage, pressure, governance] = await Promise.all([
    tenantHealth(orgId),
    slaEscalations(orgId),
    operatorWorkloads(orgId),
    auditTimeline(orgId, { limit: 25 }),
    workflowBottlenecks(orgId),
    approvalAgingChart(orgId),
    queueGovernance(orgId),
    storageGovernance(orgId),
    streamHealth(),
    lineageOverview(orgId),
    tenantPressureIndicator(orgId),
    governanceEventsRecent(orgId, { limit: 20 }),
  ]);
  return {
    generated_at: new Date().toISOString(),
    organization_id: orgId,
    tenant,
    pressure,
    sla,
    workloads,
    audit_recent: audit,
    bottlenecks,
    approval_aging: aging,
    queue: queueGov,
    storage,
    streams,
    lineage,
    governance_events: governance,
  };
}

module.exports = {
  tenantHealth, slaEscalations, operatorWorkloads, auditTimeline,
  workflowBottlenecks, approvalAgingChart, queueGovernance,
  storageGovernance, streamHealth, lineageOverview,
  governanceEventsRecent, tenantPressureIndicator,
  getGovernance,
};
