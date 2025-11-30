#!/bin/bash

# Deploy Motosai to Google Cloud Run
# Similar to imaprompt setup - serves both client and server from Cloud Run

set -e

# Configuration
PROJECT_ID="punchies-game"
SERVICE_NAME="motosai"
REGION="us-central1"
DOMAIN="motosai.com"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🏍️ Deploying Motosai to Google Cloud Run...${NC}"
echo ""

echo -e "${YELLOW}🐳 Building and deploying with Cloud Build...${NC}"

# Use Cloud Build with custom config that builds client and server together
gcloud builds submit \
    --config cloudbuild-cloudrun.yaml \
    --project $PROJECT_ID

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
    --platform managed \
    --region $REGION \
    --project $PROJECT_ID \
    --format 'value(status.url)')

echo ""
echo -e "${GREEN}✅ Deployment successful!${NC}"
echo ""
echo "📌 Service Details:"
echo "   - Service Name: $SERVICE_NAME"
echo "   - Cloud Run URL: $SERVICE_URL"
echo "   - Custom Domain: https://$DOMAIN"
echo ""
echo "🎮 Game Features:"
echo "   - Real-time multiplayer via WebSocket"
echo "   - Client files served from /client/dist"
echo "   - WebSocket server on same domain"
echo ""
echo "📝 Next Steps:"
echo "   1. Map domain $DOMAIN to this service:"
echo "      gcloud run domain-mappings create --service=$SERVICE_NAME --domain=$DOMAIN --region=$REGION --project=$PROJECT_ID"
echo "   2. Verify domain ownership in Cloud Console"
echo "   3. Update DNS records with provided values"
echo ""
echo "🔍 View logs:"
echo "   gcloud logging read \"resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME\" --limit 50 --project=$PROJECT_ID"
echo ""
