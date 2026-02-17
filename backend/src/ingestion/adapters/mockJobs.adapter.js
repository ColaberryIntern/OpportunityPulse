const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');

/**
 * Deterministic set of 15 AI job postings for development and testing.
 * Always returns the same records in the same order.
 */
const MOCK_AI_JOBS = [
  {
    id: 'job-goog-001',
    company: 'Google',
    title: 'Senior ML Engineer',
    description: 'Design and implement large-scale machine learning pipelines for Google Search ranking. Collaborate with research teams to bring state-of-the-art models to production.',
    location: 'Mountain View, CA',
    skills: ['Python', 'TensorFlow', 'Kubernetes', 'MLOps', 'Distributed Systems'],
    salaryMin: 190000,
    salaryMax: 280000,
    url: 'https://careers.google.com/jobs/ml-engineer-001',
    postedDate: '2026-02-01',
    expiresDate: '2026-04-01',
  },
  {
    id: 'job-meta-002',
    company: 'Meta',
    title: 'AI Research Scientist',
    description: 'Conduct fundamental research in natural language processing and publish at top-tier venues. Develop novel architectures for content understanding.',
    location: 'Menlo Park, CA',
    skills: ['Python', 'PyTorch', 'NLP', 'Transformers', 'Research'],
    salaryMin: 200000,
    salaryMax: 320000,
    url: 'https://metacareers.com/jobs/ai-research-002',
    postedDate: '2026-02-03',
    expiresDate: '2026-04-03',
  },
  {
    id: 'job-oai-003',
    company: 'OpenAI',
    title: 'LLM Infrastructure Engineer',
    description: 'Build and scale the infrastructure powering large language model training and inference. Optimize GPU cluster utilization and model serving latency.',
    location: 'San Francisco, CA',
    skills: ['Python', 'CUDA', 'Kubernetes', 'Distributed Systems', 'LLMs'],
    salaryMin: 220000,
    salaryMax: 350000,
    url: 'https://openai.com/careers/llm-infra-003',
    postedDate: '2026-02-05',
    expiresDate: '2026-04-05',
  },
  {
    id: 'job-anth-004',
    company: 'Anthropic',
    title: 'Safety Research Engineer',
    description: 'Research and implement techniques for making AI systems more interpretable and aligned. Work on RLHF, constitutional AI, and scalable oversight methods.',
    location: 'San Francisco, CA',
    skills: ['Python', 'PyTorch', 'LLMs', 'RLHF', 'AI Safety'],
    salaryMin: 210000,
    salaryMax: 340000,
    url: 'https://anthropic.com/careers/safety-research-004',
    postedDate: '2026-02-02',
    expiresDate: '2026-04-02',
  },
  {
    id: 'job-msft-005',
    company: 'Microsoft',
    title: 'Applied AI Engineer',
    description: 'Integrate AI capabilities into Microsoft 365 products. Develop and deploy transformer-based models for productivity features across the Office suite.',
    location: 'Redmond, WA',
    skills: ['Python', 'C#', 'Azure ML', 'LLMs', 'NLP'],
    salaryMin: 175000,
    salaryMax: 260000,
    url: 'https://careers.microsoft.com/ai-engineer-005',
    postedDate: '2026-02-04',
    expiresDate: '2026-04-04',
  },
  {
    id: 'job-amzn-006',
    company: 'Amazon',
    title: 'ML Platform Engineer',
    description: 'Build and maintain SageMaker ML platform components. Develop scalable training and inference infrastructure used by thousands of internal teams.',
    location: 'Seattle, WA',
    skills: ['Python', 'AWS', 'SageMaker', 'Docker', 'MLOps'],
    salaryMin: 180000,
    salaryMax: 270000,
    url: 'https://amazon.jobs/ml-platform-006',
    postedDate: '2026-02-06',
    expiresDate: '2026-04-06',
  },
  {
    id: 'job-aapl-007',
    company: 'Apple',
    title: 'Computer Vision Engineer',
    description: 'Develop advanced computer vision models for augmented reality and device intelligence. Work on real-time object detection and scene understanding.',
    location: 'Cupertino, CA',
    skills: ['Python', 'Swift', 'Computer Vision', 'Core ML', 'PyTorch'],
    salaryMin: 185000,
    salaryMax: 275000,
    url: 'https://jobs.apple.com/cv-engineer-007',
    postedDate: '2026-02-07',
    expiresDate: '2026-04-07',
  },
  {
    id: 'job-nvda-008',
    company: 'NVIDIA',
    title: 'Deep Learning Framework Engineer',
    description: 'Optimize deep learning kernels and model training performance on NVIDIA GPUs. Contribute to CUDA libraries and triton compiler for AI workloads.',
    location: 'Santa Clara, CA',
    skills: ['C++', 'CUDA', 'Python', 'PyTorch', 'TensorFlow'],
    salaryMin: 195000,
    salaryMax: 300000,
    url: 'https://nvidia.com/careers/dl-framework-008',
    postedDate: '2026-02-08',
    expiresDate: '2026-04-08',
  },
  {
    id: 'job-tsla-009',
    company: 'Tesla',
    title: 'Autonomy ML Engineer',
    description: 'Train and deploy neural networks for Tesla Autopilot and Full Self-Driving. Work on perception, planning, and control models at massive scale.',
    location: 'Palo Alto, CA',
    skills: ['Python', 'PyTorch', 'Computer Vision', 'C++', 'Autonomous Driving'],
    salaryMin: 190000,
    salaryMax: 310000,
    url: 'https://tesla.com/careers/autonomy-ml-009',
    postedDate: '2026-02-09',
    expiresDate: '2026-04-09',
  },
  {
    id: 'job-pltr-010',
    company: 'Palantir',
    title: 'AI Platform Architect',
    description: 'Design AI-powered analytics pipelines for Palantir Foundry. Build LLM-driven assistants for government and enterprise intelligence workflows.',
    location: 'Denver, CO',
    skills: ['Python', 'Java', 'LLMs', 'Spark', 'Kubernetes'],
    salaryMin: 185000,
    salaryMax: 290000,
    url: 'https://palantir.com/careers/ai-architect-010',
    postedDate: '2026-02-10',
    expiresDate: '2026-04-10',
  },
  {
    id: 'job-scai-011',
    company: 'Scale AI',
    title: 'ML Data Quality Lead',
    description: 'Lead data quality initiatives for ML training datasets. Develop automated quality assurance systems and manage annotation pipelines for LLM fine-tuning.',
    location: 'San Francisco, CA',
    skills: ['Python', 'NLP', 'Data Engineering', 'SQL', 'MLOps'],
    salaryMin: 170000,
    salaryMax: 250000,
    url: 'https://scale.com/careers/ml-data-quality-011',
    postedDate: '2026-02-11',
    expiresDate: '2026-04-11',
  },
  {
    id: 'job-dbrx-012',
    company: 'Databricks',
    title: 'MLflow Core Engineer',
    description: 'Develop and extend MLflow open-source platform for experiment tracking, model registry, and deployment. Build integrations with major cloud providers.',
    location: 'San Francisco, CA',
    skills: ['Python', 'Scala', 'Spark', 'MLOps', 'Kubernetes'],
    salaryMin: 180000,
    salaryMax: 275000,
    url: 'https://databricks.com/careers/mlflow-engineer-012',
    postedDate: '2026-02-12',
    expiresDate: '2026-04-12',
  },
  {
    id: 'job-snow-013',
    company: 'Snowflake',
    title: 'AI/ML Product Engineer',
    description: 'Build Snowflake Cortex AI features including text-to-SQL, document understanding, and in-warehouse ML inference capabilities.',
    location: 'San Mateo, CA',
    skills: ['Python', 'SQL', 'LLMs', 'NLP', 'Cloud Infrastructure'],
    salaryMin: 175000,
    salaryMax: 265000,
    url: 'https://snowflake.com/careers/ai-ml-engineer-013',
    postedDate: '2026-02-13',
    expiresDate: '2026-04-13',
  },
  {
    id: 'job-strp-014',
    company: 'Stripe',
    title: 'ML Engineer — Fraud Detection',
    description: 'Build and improve real-time ML models for payment fraud detection at scale. Develop feature engineering pipelines and model monitoring systems.',
    location: 'South San Francisco, CA',
    skills: ['Python', 'TensorFlow', 'Real-Time Systems', 'SQL', 'MLOps'],
    salaryMin: 185000,
    salaryMax: 280000,
    url: 'https://stripe.com/careers/ml-fraud-014',
    postedDate: '2026-02-14',
    expiresDate: '2026-04-14',
  },
  {
    id: 'job-figm-015',
    company: 'Figma',
    title: 'ML Engineer — Generative Design',
    description: 'Develop generative AI features for the Figma design platform. Build models for layout suggestion, auto-complete, and design-to-code generation.',
    location: 'San Francisco, CA',
    skills: ['Python', 'PyTorch', 'Computer Vision', 'Generative AI', 'TypeScript'],
    salaryMin: 180000,
    salaryMax: 270000,
    url: 'https://figma.com/careers/ml-gen-design-015',
    postedDate: '2026-02-15',
    expiresDate: '2026-04-15',
  },
];

/**
 * MockJobsAdapter — returns a deterministic set of 15 AI job postings.
 * Intended for development, testing, and demo purposes.
 */
class MockJobsAdapter extends BaseAdapter {
  /**
   * Fetch mock AI job records.
   * @returns {Promise<Array>} Deterministic array of 15 raw job records.
   */
  async fetch() {
    return MOCK_AI_JOBS;
  }

  /**
   * Transform raw job records into Opportunity model shape.
   * @param {Array} rawRecords
   * @returns {Array}
   */
  transform(rawRecords) {
    return rawRecords.map((record) => ({
      type: OPPORTUNITY_TYPES.AI_JOB,
      source: 'mock_jobs',
      sourceId: record.id,
      title: `${record.title} — ${record.company}`,
      description: record.description,
      sourceUrl: record.url,
      status: 'active',
      category: 'AI/ML Engineering',
      tags: record.skills,
      location: record.location,
      value: record.salaryMax || null,
      publishedAt: record.postedDate ? new Date(record.postedDate) : null,
      expiresAt: record.expiresDate ? new Date(record.expiresDate) : null,
      sourceData: record,
    }));
  }
}

module.exports = MockJobsAdapter;
