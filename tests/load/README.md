# Load Testing

## Prerequisites
Install k6: https://k6.io/docs/getting-started/installation/

## Run Tests

### Health check (baseline)
```bash
k6 run tests/load/health-check.js
```

### Full API flow
```bash
k6 run tests/load/api-flow.js
```

### Against production
```bash
k6 run -e BASE_URL=https://95.216.199.47 tests/load/api-flow.js
```

## Interpreting Results
- `http_req_duration`: p95 should be under 500ms for API calls
- `http_req_failed`: Should be under 5% error rate
- `vus`: Virtual users (concurrent simulated users)
