# Migration Notes - September 28, 2025

## Frontend Hosting Migration: GCS → Cloud Run

**Date**: 2025-09-28
**Status**: Planning Phase

### Current Architecture
- **Frontend**: Google Cloud Storage (static hosting)
- **Backend**: Cloud Run (Node.js + Socket.io)

### Planned Migration
- **From**: Google Cloud Storage static hosting
- **To**: Cloud Run frontend hosting
- **Reason**: Better performance, dynamic content capabilities, unified hosting architecture

### Benefits of Migration
- Unified hosting platform (both frontend and backend on Cloud Run)
- Better performance and caching control
- Support for server-side rendering if needed
- Simplified deployment pipeline
- Better integration with backend services

### Migration Tasks
- [ ] Create new Cloud Run service for frontend
- [ ] Update deployment scripts
- [ ] Test frontend performance on Cloud Run
- [ ] Update DNS/routing configuration
- [ ] Deprecate GCS bucket usage
- [ ] Update documentation

### Timeline
- **Planning**: September 2025
- **Implementation**: TBD
- **Go-live**: TBD

---
*Note created: 2025-09-28*