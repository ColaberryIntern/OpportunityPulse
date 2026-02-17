'use strict';

const bcrypt = require('bcryptjs');

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const passwordHash = await bcrypt.hash('Demo@12345', 12);

    // ── Helper: date relative to now ──────────────────────────────
    const daysAgo = (d) => new Date(now.getTime() - d * 86400000);
    const daysFromNow = (d) => new Date(now.getTime() + d * 86400000);
    const monthsFromNow = (m) => {
      const date = new Date(now);
      date.setMonth(date.getMonth() + m);
      return date;
    };

    // ================================================================
    // 1. USERS (IDs 2, 3, 4)
    // ================================================================
    await queryInterface.bulkInsert('users', [
      {
        email: 'consultant@demo.com',
        password_hash: passwordHash,
        name: 'Alex Chen',
        company: 'TechVentures LLC',
        email_verified: true,
        role_id: 2, // consultant
        created_at: daysAgo(30),
        updated_at: now,
      },
      {
        email: 'auditor@demo.com',
        password_hash: passwordHash,
        name: 'Sarah Johnson',
        company: 'ComplianceFirst Inc',
        email_verified: true,
        role_id: 3, // auditor
        created_at: daysAgo(25),
        updated_at: now,
      },
      {
        email: 'devops@demo.com',
        password_hash: passwordHash,
        name: 'Marcus Williams',
        company: 'CloudOps Solutions',
        email_verified: true,
        role_id: 4, // devops
        created_at: daysAgo(20),
        updated_at: now,
      },
    ], {});

    // ================================================================
    // 2. SUBSCRIPTIONS
    // ================================================================
    await queryInterface.bulkInsert('subscriptions', [
      {
        user_id: 2,
        plan_type: 'premium',
        start_date: daysAgo(30),
        end_date: monthsFromNow(11),
        created_at: daysAgo(30),
        updated_at: now,
      },
      {
        user_id: 3,
        plan_type: 'free',
        start_date: now,
        end_date: null,
        created_at: now,
        updated_at: now,
      },
      {
        user_id: 4,
        plan_type: 'free',
        start_date: now,
        end_date: null,
        created_at: now,
        updated_at: now,
      },
    ], {});

    // ================================================================
    // 3. OPPORTUNITIES — 25 total
    // ================================================================

    // ── 10 Government Contracts (data_source_id = 1) ─────────────
    const govContracts = [
      {
        type: 'gov_contract',
        title: 'AI-Powered Cybersecurity Defense System',
        description: 'Development of an advanced AI-driven cybersecurity platform for real-time threat detection, anomaly analysis, and automated incident response across Department of Defense networks.',
        source: 'sam_gov',
        source_id: 'seed-gov-001',
        source_url: 'https://sam.gov/opp/seed-gov-001',
        status: 'active',
        category: 'cybersecurity',
        tags: '{ai,cybersecurity,defense,machine-learning,dod}',
        location: 'Washington, DC',
        value: 4500000.00,
        published_at: daysAgo(5),
        expires_at: daysFromNow(75),
        source_data: JSON.stringify({ agency: 'DoD', solicitation_number: 'W912DQ-26-R-0001', naics: '541512', set_aside: 'Total Small Business', response_date: daysFromNow(75).toISOString() }),
        ai_score: 92.00,
        ai_analysis: JSON.stringify({ confidence: 0.92, keywords: ['AI', 'cybersecurity', 'neural network'], competition_level: 'moderate', recommendation: 'Strong match for AI security firms' }),
        data_source_id: 1,
        created_at: daysAgo(5),
        updated_at: daysAgo(5),
      },
      {
        type: 'gov_contract',
        title: 'Machine Learning for Weather Prediction',
        description: 'Implementation of machine learning models for enhanced weather prediction and climate modeling using satellite and sensor data for NOAA forecasting systems.',
        source: 'sam_gov',
        source_id: 'seed-gov-002',
        source_url: 'https://sam.gov/opp/seed-gov-002',
        status: 'active',
        category: 'data_science',
        tags: '{ai,machine-learning,weather,climate,noaa}',
        location: 'Silver Spring, MD',
        value: 2800000.00,
        published_at: daysAgo(8),
        expires_at: daysFromNow(82),
        source_data: JSON.stringify({ agency: 'NOAA', solicitation_number: 'NOAA-OAR-26-0045', naics: '541715', set_aside: 'None', response_date: daysFromNow(82).toISOString() }),
        ai_score: 85.00,
        ai_analysis: JSON.stringify({ confidence: 0.85, keywords: ['ML', 'weather', 'prediction model'], competition_level: 'high', recommendation: 'Requires strong climate data expertise' }),
        data_source_id: 1,
        created_at: daysAgo(8),
        updated_at: daysAgo(8),
      },
      {
        type: 'gov_contract',
        title: 'NLP Document Processing Platform',
        description: 'Build a natural language processing platform to automate document intake, classification, and information extraction for GSA procurement workflows.',
        source: 'sam_gov',
        source_id: 'seed-gov-003',
        source_url: 'https://sam.gov/opp/seed-gov-003',
        status: 'active',
        category: 'nlp',
        tags: '{ai,nlp,document-processing,automation,gsa}',
        location: 'Washington, DC',
        value: 1200000.00,
        published_at: daysAgo(12),
        expires_at: daysFromNow(68),
        source_data: JSON.stringify({ agency: 'GSA', solicitation_number: 'GS-35F-26-0123', naics: '541511', set_aside: '8(a)', response_date: daysFromNow(68).toISOString() }),
        ai_score: 78.00,
        ai_analysis: JSON.stringify({ confidence: 0.78, keywords: ['NLP', 'document processing', 'OCR'], competition_level: 'moderate', recommendation: 'Good fit for NLP-focused vendors' }),
        data_source_id: 1,
        created_at: daysAgo(12),
        updated_at: daysAgo(12),
      },
      {
        type: 'gov_contract',
        title: 'Autonomous Vehicle Testing Framework',
        description: 'Design and development of a comprehensive testing and validation framework for autonomous vehicle systems, including simulation environments and safety benchmarks.',
        source: 'sam_gov',
        source_id: 'seed-gov-004',
        source_url: 'https://sam.gov/opp/seed-gov-004',
        status: 'active',
        category: 'autonomous_systems',
        tags: '{ai,autonomous-vehicles,testing,simulation,dot}',
        location: 'Washington, DC',
        value: 3200000.00,
        published_at: daysAgo(3),
        expires_at: daysFromNow(87),
        source_data: JSON.stringify({ agency: 'DOT', solicitation_number: 'DTFH61-26-R-0078', naics: '541330', set_aside: 'None', response_date: daysFromNow(87).toISOString() }),
        ai_score: 88.00,
        ai_analysis: JSON.stringify({ confidence: 0.88, keywords: ['autonomous', 'testing framework', 'simulation'], competition_level: 'low', recommendation: 'Niche opportunity with limited competition' }),
        data_source_id: 1,
        created_at: daysAgo(3),
        updated_at: daysAgo(3),
      },
      {
        type: 'gov_contract',
        title: 'Healthcare AI Diagnostics System',
        description: 'Development of an AI-powered diagnostics support system for Veterans Affairs medical facilities, integrating medical imaging analysis and clinical decision support.',
        source: 'sam_gov',
        source_id: 'seed-gov-005',
        source_url: 'https://sam.gov/opp/seed-gov-005',
        status: 'active',
        category: 'healthcare',
        tags: '{ai,healthcare,diagnostics,medical-imaging,va}',
        location: 'Washington, DC',
        value: 5100000.00,
        published_at: daysAgo(2),
        expires_at: daysFromNow(88),
        source_data: JSON.stringify({ agency: 'VA', solicitation_number: 'VA118-26-R-0234', naics: '541512', set_aside: 'SDVOSB', response_date: daysFromNow(88).toISOString() }),
        ai_score: 95.00,
        ai_analysis: JSON.stringify({ confidence: 0.95, keywords: ['healthcare AI', 'diagnostics', 'medical imaging'], competition_level: 'moderate', recommendation: 'High-value opportunity with strong AI alignment' }),
        data_source_id: 1,
        created_at: daysAgo(2),
        updated_at: daysAgo(2),
      },
      {
        type: 'gov_contract',
        title: 'Smart Grid Optimization AI',
        description: 'AI-driven smart grid optimization system for energy distribution, demand forecasting, and renewable integration across Department of Energy facilities.',
        source: 'sam_gov',
        source_id: 'seed-gov-006',
        source_url: 'https://sam.gov/opp/seed-gov-006',
        status: 'active',
        category: 'energy',
        tags: '{ai,smart-grid,energy,optimization,doe}',
        location: 'Washington, DC',
        value: 2100000.00,
        published_at: daysAgo(15),
        expires_at: daysFromNow(65),
        source_data: JSON.stringify({ agency: 'DOE', solicitation_number: 'DE-SOL-26-00567', naics: '541330', set_aside: 'None', response_date: daysFromNow(65).toISOString() }),
        ai_score: 82.00,
        ai_analysis: JSON.stringify({ confidence: 0.82, keywords: ['smart grid', 'energy optimization', 'demand forecasting'], competition_level: 'moderate', recommendation: 'Requires energy sector domain knowledge' }),
        data_source_id: 1,
        created_at: daysAgo(15),
        updated_at: daysAgo(15),
      },
      {
        type: 'gov_contract',
        title: 'AI-Based Fraud Detection System',
        description: 'Implementation of an AI-based fraud detection and prevention system for Treasury Department financial transaction monitoring and anomaly detection.',
        source: 'sam_gov',
        source_id: 'seed-gov-007',
        source_url: 'https://sam.gov/opp/seed-gov-007',
        status: 'active',
        category: 'fintech',
        tags: '{ai,fraud-detection,finance,treasury,anomaly-detection}',
        location: 'Washington, DC',
        value: 1800000.00,
        published_at: daysAgo(18),
        expires_at: daysFromNow(62),
        source_data: JSON.stringify({ agency: 'Treasury', solicitation_number: 'TREAS-26-R-0089', naics: '541512', set_aside: 'Total Small Business', response_date: daysFromNow(62).toISOString() }),
        ai_score: 76.00,
        ai_analysis: JSON.stringify({ confidence: 0.76, keywords: ['fraud detection', 'financial AI', 'anomaly'], competition_level: 'high', recommendation: 'Competitive space, strong past performance needed' }),
        data_source_id: 1,
        created_at: daysAgo(18),
        updated_at: daysAgo(18),
      },
      {
        type: 'gov_contract',
        title: 'Satellite Image Analysis Platform',
        description: 'Advanced satellite imagery analysis platform leveraging deep learning for NASA Earth observation programs, including change detection and feature extraction.',
        source: 'sam_gov',
        source_id: 'seed-gov-008',
        source_url: 'https://sam.gov/opp/seed-gov-008',
        status: 'active',
        category: 'computer_vision',
        tags: '{ai,satellite,computer-vision,deep-learning,nasa}',
        location: 'Houston, TX',
        value: 6200000.00,
        published_at: daysAgo(4),
        expires_at: daysFromNow(86),
        source_data: JSON.stringify({ agency: 'NASA', solicitation_number: 'NNJ26-RPF-0012', naics: '541715', set_aside: 'None', response_date: daysFromNow(86).toISOString() }),
        ai_score: 91.00,
        ai_analysis: JSON.stringify({ confidence: 0.91, keywords: ['satellite imagery', 'deep learning', 'computer vision'], competition_level: 'low', recommendation: 'Excellent opportunity for CV specialists' }),
        data_source_id: 1,
        created_at: daysAgo(4),
        updated_at: daysAgo(4),
      },
      {
        type: 'gov_contract',
        title: 'Border Security AI Monitoring',
        description: 'AI-powered border surveillance and monitoring system with real-time object detection, tracking, and alerting capabilities for DHS border operations.',
        source: 'sam_gov',
        source_id: 'seed-gov-009',
        source_url: 'https://sam.gov/opp/seed-gov-009',
        status: 'active',
        category: 'security',
        tags: '{ai,border-security,surveillance,object-detection,dhs}',
        location: 'Washington, DC',
        value: 3800000.00,
        published_at: daysAgo(10),
        expires_at: daysFromNow(70),
        source_data: JSON.stringify({ agency: 'DHS', solicitation_number: 'HSHQDC-26-R-0056', naics: '541512', set_aside: 'None', response_date: daysFromNow(70).toISOString() }),
        ai_score: 84.00,
        ai_analysis: JSON.stringify({ confidence: 0.84, keywords: ['border security', 'surveillance AI', 'object detection'], competition_level: 'moderate', recommendation: 'Requires security clearance and domain expertise' }),
        data_source_id: 1,
        created_at: daysAgo(10),
        updated_at: daysAgo(10),
      },
      {
        type: 'gov_contract',
        title: 'Agricultural Yield Prediction AI',
        description: 'AI-based agricultural yield prediction system using remote sensing data, soil analysis, and climate models to support USDA crop management programs.',
        source: 'sam_gov',
        source_id: 'seed-gov-010',
        source_url: 'https://sam.gov/opp/seed-gov-010',
        status: 'active',
        category: 'agriculture',
        tags: '{ai,agriculture,prediction,remote-sensing,usda}',
        location: 'Washington, DC',
        value: 950000.00,
        published_at: daysAgo(22),
        expires_at: daysFromNow(60),
        source_data: JSON.stringify({ agency: 'USDA', solicitation_number: 'AG-3142-S-26-0034', naics: '541715', set_aside: 'Total Small Business', response_date: daysFromNow(60).toISOString() }),
        ai_score: 73.00,
        ai_analysis: JSON.stringify({ confidence: 0.73, keywords: ['agriculture', 'yield prediction', 'remote sensing'], competition_level: 'moderate', recommendation: 'Requires agriculture domain knowledge' }),
        data_source_id: 1,
        created_at: daysAgo(22),
        updated_at: daysAgo(22),
      },
    ];

    // ── 10 AI Jobs (data_source_id = 2) ──────────────────────────
    const aiJobs = [
      {
        type: 'ai_job',
        title: 'Senior ML Engineer — Google',
        description: 'Design and implement large-scale machine learning systems for Google Search ranking and recommendation. Requires 5+ years of ML experience and expertise in TensorFlow/JAX.',
        source: 'mock_jobs',
        source_id: 'seed-job-001',
        source_url: 'https://careers.google.com/jobs/seed-job-001',
        status: 'active',
        category: 'machine_learning',
        tags: '{ml-engineer,google,tensorflow,search,ranking}',
        location: 'Mountain View, CA',
        value: 280000.00,
        published_at: daysAgo(3),
        expires_at: null,
        source_data: JSON.stringify({ company: 'Google', seniority: 'Senior', employment_type: 'Full-time', experience_years: 5, skills: ['Python', 'TensorFlow', 'JAX', 'distributed systems'] }),
        ai_score: 90.00,
        ai_analysis: JSON.stringify({ confidence: 0.90, market_demand: 'very high', salary_percentile: 85, growth_potential: 'strong' }),
        data_source_id: 2,
        created_at: daysAgo(3),
        updated_at: daysAgo(3),
      },
      {
        type: 'ai_job',
        title: 'AI Research Scientist — Anthropic',
        description: 'Conduct frontier research on AI safety, interpretability, and alignment. Publish findings and contribute to responsible AI development practices.',
        source: 'mock_jobs',
        source_id: 'seed-job-002',
        source_url: 'https://jobs.anthropic.com/seed-job-002',
        status: 'active',
        category: 'ai_research',
        tags: '{ai-research,anthropic,safety,alignment,interpretability}',
        location: 'San Francisco, CA',
        value: 350000.00,
        published_at: daysAgo(1),
        expires_at: null,
        source_data: JSON.stringify({ company: 'Anthropic', seniority: 'Senior', employment_type: 'Full-time', experience_years: 3, skills: ['Python', 'PyTorch', 'research', 'AI safety'] }),
        ai_score: 95.00,
        ai_analysis: JSON.stringify({ confidence: 0.95, market_demand: 'very high', salary_percentile: 95, growth_potential: 'exceptional' }),
        data_source_id: 2,
        created_at: daysAgo(1),
        updated_at: daysAgo(1),
      },
      {
        type: 'ai_job',
        title: 'LLM Fine-Tuning Specialist — Meta',
        description: 'Lead fine-tuning and optimization of large language models for Meta AI products. Focus on RLHF, instruction tuning, and model evaluation frameworks.',
        source: 'mock_jobs',
        source_id: 'seed-job-003',
        source_url: 'https://metacareers.com/jobs/seed-job-003',
        status: 'active',
        category: 'nlp',
        tags: '{llm,fine-tuning,meta,rlhf,nlp}',
        location: 'Menlo Park, CA',
        value: 290000.00,
        published_at: daysAgo(6),
        expires_at: null,
        source_data: JSON.stringify({ company: 'Meta', seniority: 'Senior', employment_type: 'Full-time', experience_years: 4, skills: ['Python', 'PyTorch', 'LLM', 'RLHF', 'fine-tuning'] }),
        ai_score: 88.00,
        ai_analysis: JSON.stringify({ confidence: 0.88, market_demand: 'very high', salary_percentile: 88, growth_potential: 'strong' }),
        data_source_id: 2,
        created_at: daysAgo(6),
        updated_at: daysAgo(6),
      },
      {
        type: 'ai_job',
        title: 'Computer Vision Lead — Tesla',
        description: 'Lead the computer vision team developing perception systems for Tesla autonomous driving. Design and optimize real-time neural networks for edge deployment.',
        source: 'mock_jobs',
        source_id: 'seed-job-004',
        source_url: 'https://tesla.com/careers/seed-job-004',
        status: 'active',
        category: 'computer_vision',
        tags: '{computer-vision,tesla,autonomous-driving,edge-ai,perception}',
        location: 'Palo Alto, CA',
        value: 310000.00,
        published_at: daysAgo(7),
        expires_at: null,
        source_data: JSON.stringify({ company: 'Tesla', seniority: 'Lead', employment_type: 'Full-time', experience_years: 6, skills: ['Python', 'C++', 'PyTorch', 'computer vision', 'edge deployment'] }),
        ai_score: 87.00,
        ai_analysis: JSON.stringify({ confidence: 0.87, market_demand: 'high', salary_percentile: 90, growth_potential: 'strong' }),
        data_source_id: 2,
        created_at: daysAgo(7),
        updated_at: daysAgo(7),
      },
      {
        type: 'ai_job',
        title: 'NLP Engineer — OpenAI',
        description: 'Build and improve NLP systems powering GPT models and API products. Work on tokenization, prompt engineering, and model serving infrastructure.',
        source: 'mock_jobs',
        source_id: 'seed-job-005',
        source_url: 'https://openai.com/careers/seed-job-005',
        status: 'active',
        category: 'nlp',
        tags: '{nlp,openai,gpt,transformers,model-serving}',
        location: 'San Francisco, CA',
        value: 320000.00,
        published_at: daysAgo(2),
        expires_at: null,
        source_data: JSON.stringify({ company: 'OpenAI', seniority: 'Senior', employment_type: 'Full-time', experience_years: 4, skills: ['Python', 'PyTorch', 'NLP', 'transformers', 'distributed systems'] }),
        ai_score: 93.00,
        ai_analysis: JSON.stringify({ confidence: 0.93, market_demand: 'very high', salary_percentile: 92, growth_potential: 'exceptional' }),
        data_source_id: 2,
        created_at: daysAgo(2),
        updated_at: daysAgo(2),
      },
      {
        type: 'ai_job',
        title: 'ML Infrastructure Engineer — Netflix',
        description: 'Build scalable ML infrastructure supporting recommendation, content understanding, and personalization systems serving 250M+ subscribers.',
        source: 'mock_jobs',
        source_id: 'seed-job-006',
        source_url: 'https://jobs.netflix.com/seed-job-006',
        status: 'active',
        category: 'ml_infrastructure',
        tags: '{ml-infra,netflix,recommendations,scalability,personalization}',
        location: 'Los Gatos, CA',
        value: 275000.00,
        published_at: daysAgo(9),
        expires_at: null,
        source_data: JSON.stringify({ company: 'Netflix', seniority: 'Senior', employment_type: 'Full-time', experience_years: 5, skills: ['Python', 'Java', 'Spark', 'Kubernetes', 'ML pipelines'] }),
        ai_score: 84.00,
        ai_analysis: JSON.stringify({ confidence: 0.84, market_demand: 'high', salary_percentile: 82, growth_potential: 'strong' }),
        data_source_id: 2,
        created_at: daysAgo(9),
        updated_at: daysAgo(9),
      },
      {
        type: 'ai_job',
        title: 'AI Safety Researcher — DeepMind',
        description: 'Research and develop techniques for ensuring AI systems behave safely and as intended. Focus on robustness, specification, and assurance of advanced AI systems.',
        source: 'mock_jobs',
        source_id: 'seed-job-007',
        source_url: 'https://deepmind.google/careers/seed-job-007',
        status: 'active',
        category: 'ai_safety',
        tags: '{ai-safety,deepmind,research,robustness,alignment}',
        location: 'London, UK',
        value: 260000.00,
        published_at: daysAgo(11),
        expires_at: null,
        source_data: JSON.stringify({ company: 'DeepMind', seniority: 'Senior', employment_type: 'Full-time', experience_years: 3, skills: ['Python', 'PyTorch', 'research', 'AI safety', 'formal methods'] }),
        ai_score: 86.00,
        ai_analysis: JSON.stringify({ confidence: 0.86, market_demand: 'high', salary_percentile: 80, growth_potential: 'strong' }),
        data_source_id: 2,
        created_at: daysAgo(11),
        updated_at: daysAgo(11),
      },
      {
        type: 'ai_job',
        title: 'Robotics ML Engineer — Boston Dynamics',
        description: 'Develop machine learning algorithms for robot locomotion, manipulation, and autonomous navigation. Integrate perception and planning systems.',
        source: 'mock_jobs',
        source_id: 'seed-job-008',
        source_url: 'https://bostondynamics.com/careers/seed-job-008',
        status: 'active',
        category: 'robotics',
        tags: '{robotics,ml,boston-dynamics,locomotion,perception}',
        location: 'Waltham, MA',
        value: 245000.00,
        published_at: daysAgo(14),
        expires_at: null,
        source_data: JSON.stringify({ company: 'Boston Dynamics', seniority: 'Mid-Senior', employment_type: 'Full-time', experience_years: 4, skills: ['Python', 'C++', 'ROS', 'reinforcement learning', 'robotics'] }),
        ai_score: 81.00,
        ai_analysis: JSON.stringify({ confidence: 0.81, market_demand: 'high', salary_percentile: 75, growth_potential: 'strong' }),
        data_source_id: 2,
        created_at: daysAgo(14),
        updated_at: daysAgo(14),
      },
      {
        type: 'ai_job',
        title: 'Generative AI Product Manager — Microsoft',
        description: 'Lead product strategy for generative AI features in Microsoft 365 and Azure. Drive roadmap, coordinate with engineering, and define success metrics for Copilot experiences.',
        source: 'mock_jobs',
        source_id: 'seed-job-009',
        source_url: 'https://careers.microsoft.com/seed-job-009',
        status: 'active',
        category: 'product_management',
        tags: '{product-manager,generative-ai,microsoft,copilot,azure}',
        location: 'Redmond, WA',
        value: 230000.00,
        published_at: daysAgo(5),
        expires_at: null,
        source_data: JSON.stringify({ company: 'Microsoft', seniority: 'Senior', employment_type: 'Full-time', experience_years: 5, skills: ['product management', 'AI/ML', 'stakeholder management', 'data analysis'] }),
        ai_score: 79.00,
        ai_analysis: JSON.stringify({ confidence: 0.79, market_demand: 'high', salary_percentile: 78, growth_potential: 'strong' }),
        data_source_id: 2,
        created_at: daysAgo(5),
        updated_at: daysAgo(5),
      },
      {
        type: 'ai_job',
        title: 'AI Ethics & Policy Lead — IBM',
        description: 'Lead AI ethics and policy initiatives, develop responsible AI governance frameworks, and ensure compliance with emerging AI regulations across IBM products.',
        source: 'mock_jobs',
        source_id: 'seed-job-010',
        source_url: 'https://ibm.com/careers/seed-job-010',
        status: 'active',
        category: 'ai_ethics',
        tags: '{ai-ethics,policy,ibm,governance,compliance}',
        location: 'New York, NY',
        value: 220000.00,
        published_at: daysAgo(16),
        expires_at: null,
        source_data: JSON.stringify({ company: 'IBM', seniority: 'Lead', employment_type: 'Full-time', experience_years: 7, skills: ['AI governance', 'policy', 'ethics', 'compliance', 'stakeholder engagement'] }),
        ai_score: 77.00,
        ai_analysis: JSON.stringify({ confidence: 0.77, market_demand: 'growing', salary_percentile: 72, growth_potential: 'strong' }),
        data_source_id: 2,
        created_at: daysAgo(16),
        updated_at: daysAgo(16),
      },
    ];

    // ── 5 Investments (data_source_id = 3) ───────────────────────
    const investments = [
      {
        type: 'investment',
        title: 'Anthropic — Series E ($3B)',
        description: 'Anthropic raises $3 billion in Series E funding led by Lightspeed Venture Partners, valuing the AI safety company at $60 billion. Funds will accelerate Claude model development and safety research.',
        source: 'mock_investments',
        source_id: 'seed-inv-001',
        source_url: 'https://example.com/investments/seed-inv-001',
        status: 'active',
        category: 'ai_safety',
        tags: '{investment,ai-safety,anthropic,series-e,frontier-ai}',
        location: 'San Francisco, CA',
        value: 3000000000.00,
        published_at: daysAgo(2),
        expires_at: null,
        source_data: JSON.stringify({ company: 'Anthropic', round: 'Series E', amount: 3000000000, valuation: 60000000000, lead_investor: 'Lightspeed Venture Partners', sector: 'AI Safety' }),
        ai_score: 96.00,
        ai_analysis: JSON.stringify({ confidence: 0.96, market_signal: 'very strong', sector_momentum: 'accelerating', risk_level: 'low' }),
        data_source_id: 3,
        created_at: daysAgo(2),
        updated_at: daysAgo(2),
      },
      {
        type: 'investment',
        title: 'Mistral AI — Series C ($800M)',
        description: 'Mistral AI secures $800 million in Series C funding, reinforcing European leadership in open-weight LLM development and enterprise AI deployment.',
        source: 'mock_investments',
        source_id: 'seed-inv-002',
        source_url: 'https://example.com/investments/seed-inv-002',
        status: 'active',
        category: 'llm',
        tags: '{investment,llm,mistral,series-c,open-source}',
        location: 'Paris, France',
        value: 800000000.00,
        published_at: daysAgo(7),
        expires_at: null,
        source_data: JSON.stringify({ company: 'Mistral AI', round: 'Series C', amount: 800000000, valuation: 6000000000, lead_investor: 'General Catalyst', sector: 'LLM' }),
        ai_score: 89.00,
        ai_analysis: JSON.stringify({ confidence: 0.89, market_signal: 'strong', sector_momentum: 'accelerating', risk_level: 'low' }),
        data_source_id: 3,
        created_at: daysAgo(7),
        updated_at: daysAgo(7),
      },
      {
        type: 'investment',
        title: 'Perplexity — Series C ($500M)',
        description: 'Perplexity AI raises $500 million for its AI-powered search platform, aiming to challenge traditional search engines with conversational answer-first experiences.',
        source: 'mock_investments',
        source_id: 'seed-inv-003',
        source_url: 'https://example.com/investments/seed-inv-003',
        status: 'active',
        category: 'search',
        tags: '{investment,search,perplexity,series-c,ai-search}',
        location: 'San Francisco, CA',
        value: 500000000.00,
        published_at: daysAgo(12),
        expires_at: null,
        source_data: JSON.stringify({ company: 'Perplexity', round: 'Series C', amount: 500000000, valuation: 9000000000, lead_investor: 'IVP', sector: 'AI Search' }),
        ai_score: 87.00,
        ai_analysis: JSON.stringify({ confidence: 0.87, market_signal: 'strong', sector_momentum: 'high', risk_level: 'moderate' }),
        data_source_id: 3,
        created_at: daysAgo(12),
        updated_at: daysAgo(12),
      },
      {
        type: 'investment',
        title: 'Cursor — Series B ($200M)',
        description: 'Cursor raises $200 million Series B for its AI-native code editor, driven by explosive developer adoption and innovative AI-assisted programming workflows.',
        source: 'mock_investments',
        source_id: 'seed-inv-004',
        source_url: 'https://example.com/investments/seed-inv-004',
        status: 'active',
        category: 'developer_tools',
        tags: '{investment,developer-tools,cursor,series-b,ai-coding}',
        location: 'San Francisco, CA',
        value: 200000000.00,
        published_at: daysAgo(18),
        expires_at: null,
        source_data: JSON.stringify({ company: 'Cursor', round: 'Series B', amount: 200000000, valuation: 2500000000, lead_investor: 'Andreessen Horowitz', sector: 'Developer Tools' }),
        ai_score: 83.00,
        ai_analysis: JSON.stringify({ confidence: 0.83, market_signal: 'strong', sector_momentum: 'high', risk_level: 'moderate' }),
        data_source_id: 3,
        created_at: daysAgo(18),
        updated_at: daysAgo(18),
      },
      {
        type: 'investment',
        title: 'Runway — Series D ($300M)',
        description: 'Runway secures $300 million Series D for its generative AI video and creative tools platform, expanding into enterprise content creation workflows.',
        source: 'mock_investments',
        source_id: 'seed-inv-005',
        source_url: 'https://example.com/investments/seed-inv-005',
        status: 'active',
        category: 'creative_ai',
        tags: '{investment,creative-ai,runway,series-d,generative-video}',
        location: 'New York, NY',
        value: 300000000.00,
        published_at: daysAgo(25),
        expires_at: null,
        source_data: JSON.stringify({ company: 'Runway', round: 'Series D', amount: 300000000, valuation: 4000000000, lead_investor: 'Spark Capital', sector: 'Creative AI' }),
        ai_score: 80.00,
        ai_analysis: JSON.stringify({ confidence: 0.80, market_signal: 'moderate', sector_momentum: 'growing', risk_level: 'moderate' }),
        data_source_id: 3,
        created_at: daysAgo(25),
        updated_at: daysAgo(25),
      },
    ];

    await queryInterface.bulkInsert('opportunities', [
      ...govContracts,
      ...aiJobs,
      ...investments,
    ], {});

    // ================================================================
    // 4. CONTENT (5 articles)
    // ================================================================
    await queryInterface.bulkInsert('content', [
      {
        title: 'How AI Is Reshaping Federal Government Contracting in 2026',
        body: 'The federal government is rapidly adopting artificial intelligence across its procurement processes. From automated proposal evaluation to AI-powered market research, agencies are leveraging machine learning to streamline how they identify, evaluate, and award contracts. This analysis explores the key trends shaping AI adoption in government contracting and what vendors need to know to stay competitive.\n\nKey findings include a 340% increase in AI-related solicitations compared to 2024, with the Department of Defense leading the charge. The GSA has introduced new AI-specific evaluation criteria, and small businesses are finding new pathways through AI-focused set-aside programs.',
        category: 'analysis',
        tags: '{ai,government-contracting,federal,trends,2026}',
        status: 'published',
        user_id: 1,
        created_at: daysAgo(14),
        updated_at: daysAgo(14),
        deleted_at: null,
      },
      {
        title: 'Complete Guide to SAM.gov AI Opportunity Discovery',
        body: 'Navigating SAM.gov effectively is crucial for any firm pursuing federal AI contracts. This comprehensive guide walks you through setting up targeted searches, configuring alert profiles, and using advanced filters to surface the most relevant AI and machine learning opportunities.\n\nWe cover NAICS code selection strategies for AI firms, how to interpret solicitation documents for AI-specific requirements, and tips for building a competitive capability statement that highlights your AI expertise. Whether you are new to government contracting or an experienced vendor expanding into AI, this guide provides actionable steps.',
        category: 'guide',
        tags: '{sam-gov,guide,discovery,search-tips,ai-contracts}',
        status: 'published',
        user_id: 2,
        created_at: daysAgo(10),
        updated_at: daysAgo(10),
        deleted_at: null,
      },
      {
        title: 'Q1 2026 AI Investment Landscape: Record Funding Continues',
        body: 'The first quarter of 2026 has seen unprecedented investment activity in artificial intelligence. Total AI funding reached $47 billion globally, with frontier model companies and AI infrastructure startups attracting the largest rounds. This news roundup covers the major deals, emerging trends, and what they signal for the broader AI ecosystem.\n\nNotable trends include the rise of AI safety-focused investments, growing European AI funding, and a shift toward vertical AI applications in healthcare, legal, and financial services.',
        category: 'news',
        tags: '{investments,funding,q1-2026,market-trends,venture-capital}',
        status: 'published',
        user_id: 3,
        created_at: daysAgo(7),
        updated_at: daysAgo(7),
        deleted_at: null,
      },
      {
        title: 'Compliance Checklist: AI Systems in Government Environments',
        body: 'Deploying AI systems in government environments requires navigating a complex web of compliance requirements. From FedRAMP authorization to NIST AI Risk Management Framework alignment, this guide provides a comprehensive checklist for ensuring your AI solutions meet federal standards.\n\nCovered topics include data handling requirements under FISMA, AI transparency and explainability mandates from the OMB AI guidance memo, Section 508 accessibility for AI-powered interfaces, and the new AI Bill of Rights considerations for government-facing systems.',
        category: 'guide',
        tags: '{compliance,government,fedramp,nist,ai-governance}',
        status: 'published',
        user_id: 3,
        created_at: daysAgo(4),
        updated_at: daysAgo(4),
        deleted_at: null,
      },
      {
        title: 'DevOps Best Practices for AI Model Deployment Pipelines',
        body: 'Building reliable CI/CD pipelines for AI models presents unique challenges compared to traditional software deployment. This analysis examines MLOps patterns that have proven successful in production environments, from model versioning and A/B testing to automated performance monitoring and rollback strategies.\n\nWe review infrastructure considerations including GPU resource management, model serving optimization with tools like Triton and vLLM, and strategies for managing model artifacts at scale. The guide includes architecture diagrams and configuration examples for Kubernetes-based ML deployment.',
        category: 'analysis',
        tags: '{devops,mlops,deployment,ci-cd,infrastructure}',
        status: 'published',
        user_id: 4,
        created_at: daysAgo(2),
        updated_at: daysAgo(2),
        deleted_at: null,
      },
    ], {});

    // ================================================================
    // 5. FEEDBACK (3 entries)
    // ================================================================
    await queryInterface.bulkInsert('feedback', [
      {
        user_id: 2,
        score: 5,
        comments: 'Opportunity Pulse has been invaluable for discovering government AI contracts. The AI scoring feature accurately prioritizes the most relevant opportunities for our firm. The SAM.gov integration saves us hours of manual searching every week.',
        type: 'platform',
        status: 'pending',
        target_id: null,
        created_at: daysAgo(5),
        updated_at: daysAgo(5),
      },
      {
        user_id: 3,
        score: 4,
        comments: 'The opportunity detail pages are well organized and the compliance analysis is helpful. It would be great to see more granular filtering options for set-aside types and NAICS codes. Overall a solid tool for auditing government contract opportunities.',
        type: 'opportunity',
        status: 'pending',
        target_id: null,
        created_at: daysAgo(3),
        updated_at: daysAgo(3),
      },
      {
        user_id: 4,
        score: 3,
        comments: 'The content section has good articles but could benefit from more technical depth on infrastructure topics. Would love to see API documentation and integration guides for programmatic access to the opportunity data.',
        type: 'content',
        status: 'pending',
        target_id: null,
        created_at: daysAgo(1),
        updated_at: daysAgo(1),
      },
    ], {});

    // ================================================================
    // 6. FORUM POSTS & COMMENTS
    // ================================================================

    // We need IDs for forum posts to reference in comments.
    // Use raw query to insert and return IDs for reliable FK references.
    const [forumPostResults] = await queryInterface.sequelize.query(
      `INSERT INTO forum_posts (user_id, title, body, category, status, view_count, created_at, updated_at)
       VALUES
         (2, 'Best Strategies for Winning AI Government Contracts', 'I''ve been tracking AI-related government contracts for the past year and wanted to share some strategies that have worked well for our team. Key factors include: building strong past performance narratives even with commercial AI projects, partnering with established GovCon primes, and investing in FedRAMP-ready infrastructure early.\n\nWhat strategies have worked for others in this community? Particularly interested in hearing from small businesses that have successfully competed for AI set-asides.', 'gov_contracts', 'open', 47, '${daysAgo(10).toISOString()}', '${daysAgo(10).toISOString()}'),
         (3, 'AI Job Market Trends Q1 2026', 'The AI job market continues to evolve rapidly in Q1 2026. Key observations from my analysis:\n\n1. AI safety roles have seen 200% growth year-over-year\n2. Salaries for senior ML engineers have stabilized around $300K\n3. Remote-first AI positions are declining as companies push return-to-office\n4. Demand for LLM fine-tuning expertise has surged\n\nWhat trends are others seeing? Are you finding the job market more or less competitive than last year?', 'ai_jobs', 'open', 32, '${daysAgo(6).toISOString()}', '${daysAgo(6).toISOString()}')
       RETURNING id;`
    );

    const forumPost1Id = forumPostResults[0].id;
    const forumPost2Id = forumPostResults[1].id;

    // Comments for Post 1 (3 comments from users 1, 3, 4)
    // Comments for Post 2 (2 comments from users 1, 2)
    await queryInterface.bulkInsert('comments', [
      {
        user_id: 1,
        forum_post_id: forumPost1Id,
        body: 'Great overview, Alex. From the admin perspective, I can confirm that we are seeing a significant uptick in AI-related solicitations across all agencies. One additional strategy worth mentioning is leveraging the new AI-specific SBIR/STTR topics — they provide excellent entry points for smaller firms.',
        created_at: daysAgo(9),
        updated_at: daysAgo(9),
      },
      {
        user_id: 3,
        forum_post_id: forumPost1Id,
        body: 'From an audit standpoint, I want to emphasize the importance of compliance documentation. Many AI contract bids fail not because of technical capability, but because of inadequate security documentation. Make sure your AI systems have thorough ATO packages, especially around data handling and model transparency.',
        created_at: daysAgo(8),
        updated_at: daysAgo(8),
      },
      {
        user_id: 4,
        forum_post_id: forumPost1Id,
        body: 'Infrastructure readiness is often overlooked. Having FedRAMP-authorized or FedRAMP-ready cloud environments significantly strengthens your proposals. We have helped several AI firms get their platforms authorized, and it consistently makes a difference in evaluations.',
        created_at: daysAgo(7),
        updated_at: daysAgo(7),
      },
      {
        user_id: 1,
        forum_post_id: forumPost2Id,
        body: 'Fascinating analysis, Sarah. The growth in AI safety roles aligns with what we are tracking on the platform. Government agencies are also starting to create dedicated AI safety officer positions, which could be a new category worth monitoring.',
        created_at: daysAgo(5),
        updated_at: daysAgo(5),
      },
      {
        user_id: 2,
        forum_post_id: forumPost2Id,
        body: 'The salary stabilization point is interesting. In our consulting practice, we are seeing clients differentiate on total comp packages rather than base salary — equity, flexible work, and learning budgets are becoming bigger factors for AI talent retention.',
        created_at: daysAgo(4),
        updated_at: daysAgo(4),
      },
    ], {});

    // ================================================================
    // 7. ALERTS (5 for admin user_id=1)
    // ================================================================
    await queryInterface.bulkInsert('alerts', [
      {
        user_id: 1,
        type: 'new_opportunity',
        title: '[seed] New high-value AI contract: Healthcare AI Diagnostics System',
        message: 'A new government contract opportunity scored 95/100 has been published by the VA. Estimated value: $5.1M. This matches your AI and healthcare interest profile.',
        opportunity_id: null, // We do not know the exact opportunity ID; set null for safety
        severity: 'important',
        read: true,
        metadata: JSON.stringify({ source: 'sam_gov', ai_score: 95, value: 5100000, agency: 'VA' }),
        created_at: daysAgo(2),
      },
      {
        user_id: 1,
        type: 'new_opportunity',
        title: '[seed] New NASA opportunity: Satellite Image Analysis Platform',
        message: 'NASA has published a $6.2M opportunity for satellite image analysis. AI score: 91/100. This is the highest-value opportunity in the current pipeline.',
        opportunity_id: null,
        severity: 'info',
        read: true,
        metadata: JSON.stringify({ source: 'sam_gov', ai_score: 91, value: 6200000, agency: 'NASA' }),
        created_at: daysAgo(4),
      },
      {
        user_id: 1,
        type: 'score_change',
        title: '[seed] AI score updated: Machine Learning for Weather Prediction',
        message: 'The AI relevance score for NOAA weather prediction contract has been updated from 80 to 85 after new solicitation details were published.',
        opportunity_id: null,
        severity: 'info',
        read: true,
        metadata: JSON.stringify({ previous_score: 80, new_score: 85, reason: 'Updated solicitation details', source_id: 'seed-gov-002' }),
        created_at: daysAgo(7),
      },
      {
        user_id: 1,
        type: 'trend_alert',
        title: '[seed] Emerging trend: AI safety roles surging in Q1 2026',
        message: 'AI safety-related job postings have increased 200% compared to Q1 2025. Government agencies and leading AI companies are creating dedicated safety teams. Consider expanding opportunity monitoring to include AI governance and safety categories.',
        opportunity_id: null,
        severity: 'warning',
        read: false,
        metadata: JSON.stringify({ trend_category: 'ai_safety', growth_rate: '200%', time_period: 'Q1 2026', affected_sources: ['mock_jobs', 'sam_gov'] }),
        created_at: daysAgo(1),
      },
      {
        user_id: 1,
        type: 'system',
        title: '[seed] Data source sync completed successfully',
        message: 'All three data sources (SAM.gov, Mock Jobs, Mock Investments) have completed their scheduled synchronization. 25 opportunities were processed with 0 errors.',
        opportunity_id: null,
        severity: 'info',
        read: false,
        metadata: JSON.stringify({ sources_synced: 3, opportunities_processed: 25, errors: 0, duration_ms: 4520 }),
        created_at: daysAgo(1),
      },
    ], {});

    // ================================================================
    // 8. DASHBOARD (admin user)
    // ================================================================
    await queryInterface.bulkInsert('dashboard', [
      {
        user_id: 1,
        metrics: JSON.stringify({
          widgets: [
            { id: 'opportunity_overview', type: 'stats', position: { x: 0, y: 0, w: 12, h: 2 }, config: { show_total: true, show_by_type: true, show_avg_score: true } },
            { id: 'top_opportunities', type: 'table', position: { x: 0, y: 2, w: 8, h: 4 }, config: { limit: 10, sort_by: 'ai_score', order: 'desc', columns: ['title', 'type', 'value', 'ai_score', 'status'] } },
            { id: 'score_distribution', type: 'chart', position: { x: 8, y: 2, w: 4, h: 4 }, config: { chart_type: 'histogram', field: 'ai_score', bins: 10 } },
            { id: 'recent_alerts', type: 'feed', position: { x: 0, y: 6, w: 6, h: 3 }, config: { limit: 5, show_unread_only: false } },
            { id: 'value_by_type', type: 'chart', position: { x: 6, y: 6, w: 6, h: 3 }, config: { chart_type: 'pie', group_by: 'type', metric: 'total_value' } },
            { id: 'trend_timeline', type: 'chart', position: { x: 0, y: 9, w: 12, h: 3 }, config: { chart_type: 'line', x_axis: 'published_at', y_axis: 'count', group_by: 'type', period: '30d' } },
          ],
          preferences: {
            theme: 'light',
            refresh_interval: 300,
            default_date_range: '30d',
            notifications_enabled: true,
          },
          last_viewed: now.toISOString(),
        }),
        created_at: now,
        updated_at: now,
      },
    ], {});
  },

  async down(queryInterface) {
    // Delete in reverse dependency order

    // Dashboard
    await queryInterface.bulkDelete('dashboard', {
      user_id: [1],
    }, {});

    // Alerts (seeded alerts have '[seed]' in the title)
    await queryInterface.sequelize.query(
      `DELETE FROM alerts WHERE user_id IN (1,2,3,4) AND title LIKE '%[seed]%';`
    );

    // Comments (delete all comments by users involved in seed forum posts)
    // First get forum post IDs from seeded posts, then delete related comments
    await queryInterface.sequelize.query(
      `DELETE FROM comments WHERE forum_post_id IN (
        SELECT id FROM forum_posts WHERE user_id IN (2,3) AND title IN (
          'Best Strategies for Winning AI Government Contracts',
          'AI Job Market Trends Q1 2026'
        )
      );`
    );

    // Forum posts
    await queryInterface.bulkDelete('forum_posts', {
      user_id: [2, 3],
      title: [
        'Best Strategies for Winning AI Government Contracts',
        'AI Job Market Trends Q1 2026',
      ],
    }, {});

    // Feedback
    await queryInterface.bulkDelete('feedback', {
      user_id: [2, 3, 4],
    }, {});

    // Content (by seeded user IDs — skip user 1 admin content that may exist separately)
    await queryInterface.sequelize.query(
      `DELETE FROM content WHERE user_id IN (1,2,3,4) AND title IN (
        'How AI Is Reshaping Federal Government Contracting in 2026',
        'Complete Guide to SAM.gov AI Opportunity Discovery',
        'Q1 2026 AI Investment Landscape: Record Funding Continues',
        'Compliance Checklist: AI Systems in Government Environments',
        'DevOps Best Practices for AI Model Deployment Pipelines'
      );`
    );

    // Opportunities (seeded records have source_id starting with 'seed-')
    await queryInterface.sequelize.query(
      `DELETE FROM opportunities WHERE source_id LIKE 'seed-%';`
    );

    // Subscriptions
    await queryInterface.bulkDelete('subscriptions', {
      user_id: [2, 3, 4],
    }, {});

    // Users
    await queryInterface.bulkDelete('users', {
      email: ['consultant@demo.com', 'auditor@demo.com', 'devops@demo.com'],
    }, {});
  },
};
