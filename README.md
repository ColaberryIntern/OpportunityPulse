# Opportunity Pulse

AI-powered SaaS platform for discovering and analyzing government contracts, AI job opportunities, and startup investment trends.

## Features

- **Opportunity Discovery** -- Browse and filter government contracts (SAM.gov), AI jobs, and investment rounds
- **AI Analysis** -- Automated scoring, trend detection, and weekly insight generation via OpenAI
- **Real-time Alerts** -- Configurable notifications for high-value opportunities and market shifts
- **Community** -- Discussion forums with categories, feedback system with star ratings
- **Role-based Access** -- Four roles (admin, consultant, auditor, devops) with granular permissions
- **Subscription Tiers** -- Free and premium plans with feature gating
- **API Documentation** -- Interactive Swagger UI at `/api/docs`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js, Express 5, Sequelize ORM |
| **Frontend** | React 19, Redux Toolkit, Tailwind CSS |
| **Database** | PostgreSQL 15 |
| **AI** | OpenAI GPT-4o-mini |
| **Email** | SendGrid |
| **Data Sources** | SAM.gov API, mock adapters |
| **Infrastructure** | Docker, GitHub Actions CI/CD |

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- npm

### 1. Clone and install

```bash
git clone https://github.com/ColaberryIntern/OpportunityPulse.git
cd OpportunityPulse

# Install backend
cd backend && npm install

# Install frontend
cd ../frontend && npm install
```

### 2. Configure environment

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env with your database credentials and secrets

# Frontend
cp frontend/.env.example frontend/.env
```

Required backend environment variables:

| Variable | Description |
|----------|-------------|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | PostgreSQL connection |
| `JWT_SECRET` | Minimum 32 characters |
| `BCRYPT_ROUNDS` | 10-14 (recommended: 12) |

Optional:

| Variable | Description |
|----------|-------------|
| `EMAIL_API_KEY` | SendGrid API key (emails skipped if not set) |
| `OPENAI_API_KEY` | Enables AI scoring/trends/insights |
| `SAM_GOV_API_KEY` | Enables live government contract ingestion |

### 3. Set up database

```bash
cd backend

# Run migrations
npx sequelize-cli db:migrate

# Seed roles, admin user, and data sources
npx sequelize-cli db:seed:all
```

Default admin credentials: `admin@opportunitypulse.com` / `Admin@12345`

Demo users (after seeding): `consultant@demo.com`, `auditor@demo.com`, `devops@demo.com` -- all with password `Demo@12345`

### 4. Start development servers

```bash
# Backend (port 3001)
cd backend && npm run dev

# Frontend (port 3002)
cd frontend && npm start
```

### Docker (alternative)

```bash
docker-compose up -d
```

This starts PostgreSQL, backend, and frontend. The backend auto-connects to the database on startup.

## API Documentation

Once the backend is running, visit:

- **Swagger UI**: http://localhost:3001/api/docs
- **OpenAPI JSON**: http://localhost:3001/api/docs.json

### API Modules

| Module | Prefix | Endpoints | Auth |
|--------|--------|-----------|------|
| Auth | `/api/v1/auth` | Register, login, verify, profile | Partial |
| Roles | `/api/v1/roles` | List, assign roles | Admin |
| Dashboard | `/api/v1/dashboard` | Stats, activity, charts | Yes |
| Content | `/api/v1/content` | CRUD articles | Yes |
| Search | `/api/v1/search` | Full-text search | Yes |
| Opportunities | `/api/v1/opportunities` | Browse, filter, detail | Yes |
| Ingestion | `/api/v1/ingestion` | Trigger data pulls | Admin |
| Analysis | `/api/v1/analysis` | AI scoring, trends, insights | Admin |
| Alerts | `/api/v1/alerts` | Notifications, read/unread | Yes |
| Alert Preferences | `/api/v1/alert-preferences` | Notification settings | Yes |
| Feedback | `/api/v1/feedback` | Ratings, stats | Yes |
| Forums | `/api/v1/forums` | Posts, comments | Yes |
| Public | `/api/v1/public/opportunities` | Public browse | No |

## Testing

```bash
# All backend tests (unit + integration)
cd backend && npm test

# Unit tests only
npm run test:unit

# Integration tests (requires PostgreSQL)
npm run test:integration

# E2E tests (requires PostgreSQL)
npm run test:e2e

# Frontend tests
cd frontend && npm test
```

**508 tests** across 53 suites: 217 backend unit, 157 integration, 134 frontend.

## Project Structure

```
OpportunityPulse/
├── backend/
│   └── src/
│       ├── alertPreferences/    # Alert preference CRUD
│       ├── alerts/              # Alert notifications
│       ├── analysis/            # AI scoring, trends, insights
│       ├── auth/                # Registration, login, JWT
│       ├── config/              # Environment, DB, Swagger config
│       ├── contentManager/      # Content articles CRUD
│       ├── dashboard/           # Platform statistics
│       ├── docs/                # OpenAPI schema definitions
│       ├── feedbackManager/     # Feedback & ratings
│       ├── forums/              # Discussion posts & comments
│       ├── ingestion/           # Data source adapters & orchestration
│       ├── logging/             # Winston logger, audit service
│       ├── middleware/          # Auth, RBAC, rate limiting, validation
│       ├── migrations/          # 16 Sequelize migrations
│       ├── models/              # 15 Sequelize models
│       ├── opportunities/       # Opportunity browse & detail
│       ├── public/              # Unauthenticated opportunity access
│       ├── roleManager/         # Role assignment (admin)
│       ├── search/              # Full-text search
│       ├── seeders/             # Roles, admin, data sources, demo data
│       └── utils/               # API response, email, pagination
├── frontend/
│   └── src/
│       ├── components/          # Reusable UI components
│       ├── pages/               # Route-level page components
│       ├── services/            # Axios API clients
│       └── store/slices/        # Redux Toolkit state management
├── tests/
│   ├── e2e/                     # End-to-end user journeys
│   ├── integration/             # API endpoint tests
│   └── unit/backend/            # Service layer unit tests
├── directives/                  # Feature specification documents
├── execution/scripts/           # Governance validation scripts
├── .github/workflows/           # CI/CD pipeline
└── docker-compose.yml           # Full Docker setup
```

## CI/CD Pipeline

The GitHub Actions pipeline runs 8 stages on every push to `main`/`develop`:

1. **Lint** -- ESLint for backend and frontend
2. **Security Audit** -- npm audit for vulnerabilities
3. **Governance** -- Environment validation + security scan
4. **Unit Tests** -- Backend unit tests with coverage
5. **Frontend Tests** -- React component tests with coverage
6. **Integration Tests** -- API tests against PostgreSQL
7. **E2E Tests** -- Full user journey tests
8. **Docker Build** -- Verify both images build successfully

## Governance

Run governance checks locally:

```bash
# Validate environment configuration
node execution/scripts/validate_env.js

# Run security scan
node execution/scripts/validate_security.js

# Validate database schema (requires running PostgreSQL)
node execution/scripts/validate_schema.js

# Run all checks
node execution/scripts/run_governance.js
```

## License

UNLICENSED -- Proprietary
