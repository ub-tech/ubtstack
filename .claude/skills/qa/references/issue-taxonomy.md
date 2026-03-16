# QA Issue Taxonomy

## Severity Levels

| Severity | Definition | Examples |
|----------|------------|----------|
| **critical** | Blocks a core workflow, causes data loss, or crashes the system | Order matching produces wrong results, bridge deposit lost, proof verification accepts invalid proof |
| **high** | Major feature broken or unusable, no workaround | API returns wrong data, withdrawal flow silently fails, state sync breaks |
| **medium** | Feature works but with noticeable problems, workaround exists | Slow query under load, error message unhelpful, race condition under concurrent access |
| **low** | Minor issue with no functional impact | Log formatting inconsistent, unnecessary clone in cold path, documentation drift |

## Categories

### 1. Data Integrity
- Incorrect balance calculations
- Order matching errors
- State transition violations
- Missing idempotency guards
- Serialization/deserialization mismatches

### 2. Functional
- API contract violations
- Missing or incorrect validation
- Error handling gaps (swallowed errors, wrong error types)
- State machine violations
- Incorrect business logic

### 3. Security
- Input validation bypass
- Authorization failures (accessing other users' data)
- Signature verification gaps
- Cryptographic misuse
- Trust boundary violations

### 4. Performance
- N+1 query patterns
- Unnecessary allocations in hot paths
- Missing indexes
- Lock contention under load
- Unbounded growth (memory, queue depth)

### 5. Reliability
- Missing retry logic for transient failures
- No circuit breaker for downstream dependencies
- Missing timeouts on network calls
- No graceful degradation under partial failure
- Missing health checks

### 6. Observability
- Missing structured logging at key decision points
- No metrics for new codepaths
- Missing trace context propagation
- Insufficient error context in logs
- No alerting for new failure modes
