const { getAIClient } = require('../analysis/ai.client');
const logger = require('../logging/logger');

const ACTION_PROMPTS = {
  PROPOSAL: {
    system: `You are an expert freelance proposal writer. Given a project description and the freelancer's profile, write a compelling proposal.

Output format (markdown):
## Proposal

### Cover Letter
[2-3 paragraphs tailored to the project]

### Proposed Approach
[Technical approach in 3-5 bullet points]

### Timeline
[Estimated timeline with milestones]

### Pricing
[Suggested pricing with justification]`,
  },

  ARCHITECTURE: {
    system: `You are a senior software architect. Given a project description, create a technical architecture document.

Output format (markdown):
## Technical Architecture

### System Overview
[High-level description]

### Tech Stack Recommendation
[Recommended technologies with reasoning]

### Architecture Diagram (Text)
[ASCII or text-based architecture diagram]

### Key Components
[List of major components and their responsibilities]

### Data Flow
[How data moves through the system]

### Scalability Considerations
[How the system can scale]`,
  },

  SOW: {
    system: `You are a project manager creating a Statement of Work. Given a project description, create a detailed SOW.

Output format (markdown):
## Statement of Work

### Project Overview
[1-2 paragraph summary]

### Scope of Work
[Detailed scope with inclusions and exclusions]

### Deliverables
[Numbered list of deliverables]

### Milestones & Timeline
| Milestone | Deliverable | Timeline |
|-----------|-------------|----------|
[Table of milestones]

### Acceptance Criteria
[Clear acceptance criteria for each deliverable]

### Assumptions & Dependencies
[List of assumptions]`,
  },

  SAAS_IDEA: {
    system: `You are a product strategist. Given a recurring freelance project pattern, conceptualize a SaaS product that solves the same problem at scale.

Output format (markdown):
## SaaS Product Concept

### Problem Statement
[What recurring need this addresses]

### Product Vision
[1-2 sentence vision statement]

### MVP Feature List
[5-8 core features for MVP]

### Target Market
[Primary and secondary target segments]

### Revenue Model
[Pricing tiers and revenue projections]

### Competitive Landscape
[Key competitors and differentiation]

### Go-to-Market Strategy
[How to acquire first 100 customers]`,
  },

  OUTREACH: {
    system: `You are a business development expert. Given a freelance project and client profile, write a personalized cold outreach message.

Output format (markdown):
## Outreach Template

### Subject Line
[Compelling subject line]

### Message
[Personalized 3-4 paragraph message]

### Follow-up (3 days later)
[Shorter follow-up message]

### Key Talking Points
[Bullet points to reference in a call]`,
  },
};

/**
 * Generate action content for a freelance opportunity.
 *
 * @param {string} actionType - One of: PROPOSAL, ARCHITECTURE, SOW, SAAS_IDEA, OUTREACH
 * @param {object} opportunity - The opportunity object
 * @param {object} userProfile - Optional user profile data
 * @returns {{ content: string, format: string }}
 */
async function generateFreelanceAction(actionType, opportunity, userProfile = null) {
  const promptConfig = ACTION_PROMPTS[actionType];
  if (!promptConfig) {
    throw new Error(`Unknown freelance action type: ${actionType}`);
  }

  const sourceData = opportunity.sourceData || {};
  const aiAnalysis = opportunity.aiAnalysis || {};

  const userPrompt = JSON.stringify({
    project: {
      title: opportunity.title,
      description: (opportunity.description || '').slice(0, 1500),
      budget: opportunity.value || sourceData.budget || 'Not specified',
      skills: aiAnalysis.skills || opportunity.tags || [],
      complexity: aiAnalysis.complexity || 'moderate',
      projectType: aiAnalysis.projectType || 'one-off',
      platform: sourceData.platform || opportunity.source,
      clientRating: sourceData.clientRating || sourceData.client_rating || null,
    },
    freelancerProfile: userProfile ? {
      skills: userProfile.freelancePreferences?.preferredSkills || [],
      experience: userProfile.bio || '',
      name: userProfile.name || 'Freelancer',
    } : null,
  });

  const aiClient = getAIClient();
  const { content } = await aiClient.chat(
    promptConfig.system,
    userPrompt,
    { maxTokens: 2000, temperature: 0.5 }
  );

  logger.info('Freelance action generated', {
    actionType,
    opportunityId: opportunity.id,
  });

  return {
    content,
    format: 'markdown',
    actionType,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { generateFreelanceAction };
