# Monitoring & Observability Guide

This project includes comprehensive monitoring and observability setup with **Sentry** for error tracking and **OpenTelemetry** for distributed tracing.

## 🚨 Sentry - Error Tracking

### What it does:
- Automatically captures unhandled errors on both frontend and backend
- Tracks user sessions and session replays
- Groups similar errors together
- Provides breadcrumb trails of user actions before errors

### Setup Instructions:

1. **Create Sentry Account**
   - Go to [sentry.io](https://sentry.io)
   - Create a new organization
   - Create a Next.js project
   - Copy your DSN (Data Source Name)

2. **Add Environment Variables**
   ```bash
   NEXT_PUBLIC_SENTRY_DSN=https://your-dsn@sentry.io/1234567
   SENTRY_ORG=your-org-name
   SENTRY_PROJECT=hr-office
   SENTRY_AUTH_TOKEN=your-sentry-auth-token
   ```

3. **Configure Source Maps Upload** (Optional but recommended)
   - Get auth token from Sentry: Settings → Auth Tokens
   - Source maps will be automatically uploaded during builds
   - Enables better stack traces in production

### Usage in Code:

```typescript
// Capture exceptions manually
import { captureException } from '@/sentry.client.config';

try {
  // some code
} catch (error) {
  captureException(error, { context: 'user_action_name' });
}

// Set user context
import { setUserContext } from '@/sentry.client.config';

setUserContext(userId, userEmail, userName);

// Capture messages
import { captureMessage } from '@/sentry.client.config';

captureMessage('Important event', 'warning');
```

---

## 📊 OpenTelemetry - Distributed Tracing

### What it does:
- Tracks request latencies across frontend and backend
- Creates distributed traces showing call paths
- Captures detailed performance metrics
- Helps identify bottlenecks and slow operations

### Architecture:

```
Your Application
    ↓
OpenTelemetry SDK (Client + Server)
    ↓
OTLP Exporter
    ↓
Observability Backend (Jaeger/Datadog/New Relic/etc)
    ↓
Metrics, Traces, Dashboards
```

### Supported Backends:

1. **Jaeger** (free, open-source)
   - Docker: `docker run -d -p4317:4317 -p4318:4318 -p16686:16686 jaegertracing/all-in-one`
   - UI: http://localhost:16686

2. **Datadog** (commercial)
   - OTEL_EXPORTER_OTLP_ENDPOINT=http://datadog-agent:4318

3. **New Relic** (commercial)
   - OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.nr-data.net:4318

4. **Grafana Loki Stack** (open-source)

### Setup Instructions:

1. **Local Development (Jaeger)**
   ```bash
   docker run -d \
     -p 5775:5775/udp \
     -p 6831:6831/udp \
     -p 6832:6832/udp \
     -p 5778:5778 \
     -p 16686:16686 \
     -p 14268:14268 \
     --name jaeger \
     jaegertracing/all-in-one:latest
   ```

2. **Configure Environment**
   ```bash
   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
   NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
   NEXT_PUBLIC_ENABLE_OTEL=true
   ```

3. **View Traces**
   - Open http://localhost:16686
   - Select "hr-office-frontend" or "hr-office-backend" service
   - View traces and metrics

### Usage in Code:

```typescript
// Wrap async operations with tracing
import { withTracing } from '@/lib/tracing';

const result = await withTracing('operation.name', async () => {
  // Your code here
  return doSomething();
}, {
  'custom.attribute': 'value'
});

// Wrap API routes
import { withTracing, addSpanAttributes } from '@/lib/tracing';

export async function POST(req: NextRequest) {
  return withTracing('api.endpoint.name', async () => {
    // Route logic
    addSpanAttributes({
      'http.status': 200,
      'db.query_count': 3
    });
  });
}

// In server actions
import { withTracing } from '@/lib/tracing';

export const myServerAction = async (data: any) => {
  return withTracing('server.action.name', async () => {
    // Server action logic
  });
};
```

---

## 🔍 What Gets Traced

### Frontend (Browser)
- ✅ Page loads and navigation
- ✅ API calls (fetch requests)
- ✅ User interactions (clicks, form submissions)
- ✅ Long tasks
- ✅ Component rendering performance

### Backend (Node.js)
- ✅ HTTP requests
- ✅ Database queries (Convex operations)
- ✅ External API calls
- ✅ Authentication flows
- ✅ Error handling

---

## 📈 Key Metrics to Monitor

### Performance Metrics
- **LCP** (Largest Contentful Paint) - Page load performance
- **FID** (First Input Delay) - Interactivity
- **CLS** (Cumulative Layout Shift) - Visual stability
- **API Latency** - Backend response times
- **Database Latency** - Query performance

### Error Metrics
- **Error Rate** - % of requests with errors
- **Error Types** - Categorized by error kind
- **Affected Users** - How many users hit errors
- **Error Timeline** - When errors increase/decrease

### Business Metrics
- **Login Attempts** - Success/failure rates
- **Leave Requests** - Processing times
- **Task Assignments** - Operation success rates

---

## 🚀 Example: Complete Monitoring Flow

```typescript
// 1. API Route with Tracing
export async function POST(req: NextRequest) {
  return withTracing('leave.create', async () => {
    const userId = getUserId();
    addSpanAttributes({
      'user.id': userId,
      'operation': 'leave_request_create'
    });

    try {
      const response = await fetch('convex-api', {...});
      addSpanAttributes({ 'http.status': response.status });
      return NextResponse.json(response);
    } catch (error) {
      captureServerException(error, { userId });
      throw error;
    }
  });
}

// 2. Client-side Usage
function LeaveForm() {
  const [loading, setLoading] = useState(false);
  
  async function handleSubmit(data) {
    return withSpan('leave.form.submit', async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/leaves', {
          method: 'POST',
          body: JSON.stringify(data)
        });
        
        if (!response.ok) {
          throw new Error('Failed to submit');
        }
        
        return response.json();
      } catch (error) {
        captureException(error);
        throw error;
      } finally {
        setLoading(false);
      }
    });
  }
  
  return <form onSubmit={handleSubmit}>...</form>;
}

// 3. Monitoring Dashboard Shows:
// - Request -> API Route -> Database Query timeline
// - Frontend render time + API latency
// - Error rate and types
// - User sessions affected
```

---

## 🛠️ Troubleshooting

### Traces not appearing in Jaeger
- Check if OTLP endpoint is correct
- Ensure `NEXT_PUBLIC_ENABLE_OTEL=true` is set
- Check browser console for errors
- Verify Jaeger is running: `docker ps`

### Sentry not capturing errors
- Check DSN is correct
- Verify `NEXT_PUBLIC_SENTRY_DSN` is set
- Check script blocker extensions
- Ensure release matches `NEXT_PUBLIC_APP_VERSION`

### Performance degradation
- Adjust `tracesSampleRate` (set to 0.1 in production)
- Disable less important instrumentations
- Use batched span processors

---

## 📚 Resources

- [Sentry Docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [OpenTelemetry Docs](https://opentelemetry.io/docs/)
- [OTEL for Next.js](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/sdk-node)
- [Jaeger UI Guide](https://www.jaegertracing.io/docs/1.18/frontend-ui/)

---

**Created:** 2026-03-04
**Last Updated:** 2026-03-04
