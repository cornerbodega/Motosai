# Flickr API Setup - FREE Account

## You DON'T Need Flickr Pro!

The Flickr API is completely free for non-commercial use. You just need a regular Flickr account (free) to get an API key.

## Quick Setup (5 minutes)

### 1. Create Free Flickr Account
- Go to https://www.flickr.com
- Sign up with email (free account is fine)
- You DON'T need Pro ($8.25/month) - that's only for uploading unlimited photos

### 2. Get Your Free API Key
1. Go to: https://www.flickr.com/services/apps/create/
2. Choose "Apply for a Non-Commercial Key" (FREE!)
3. Fill in:
   - **App Name**: "Motosai PCH Racing"
   - **Description**: "Personal motorcycle racing game using CC-licensed photos for backgrounds"
4. You'll instantly get:
   - **API Key**: (looks like: 2f3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o)
   - **Secret**: (you don't need this for public photo searches)

### 3. Add to Your Code
```javascript
// In FlickrService.js, replace:
this.apiKey = apiKey || 'YOUR_FLICKR_API_KEY';

// With your actual key:
this.apiKey = apiKey || '2f3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o';
```

## API Limits (Very Generous)

**Free API Key Limits:**
- 3,600 requests per hour
- That's 1 request per second!
- We only need ~240 requests for entire route
- More than enough for development

**What You CAN Do (Free):**
- Search all public photos
- Filter by location (GPS coordinates)
- Filter by Creative Commons licenses
- Get high-resolution URLs
- Access photo metadata

**What You CAN'T Do (Free):**
- Upload photos (we don't need this)
- Access private photos (we don't need this)
- Commercial use (this is personal project)

## Alternative: No API Key Testing

For immediate testing without API key, I can create a mock service:

```javascript
// MockFlickrService.js - works without API
class MockFlickrService {
  async fetchPhotosForLocation(lat, lng) {
    // Return sample gradients or local test images
    return [{
      url: '/test-images/ocean-view.jpg',
      width: 2400,
      height: 800,
      // ... etc
    }];
  }
}
```

## Why CC-Licensed Photos Are Perfect

Creative Commons photos are:
- **Free to use** (even commercially with attribution)
- **Legal** (no copyright issues)
- **Abundant** (millions available)
- **High quality** (many photographers share best work)

We just need to show attribution like:
"Photo by JohnDoe (CC BY 2.0)"

## Cost Comparison

**Our Approach:**
- Flickr API: FREE
- CC Photos: FREE
- Total: $0

**Alternative (Google Street View):**
- $7 per 1,000 panoramas
- Would cost ~$1.68 for full route
- More restrictive usage terms
- Lower resolution

## Ready to Test?

Once you have your API key (takes 2 minutes), you can test immediately:

```javascript
const flickr = new FlickrService('your-api-key-here');
await flickr.testAPI(); // Tests Big Sur, Golden Gate, Malibu
```

This will fetch real photos from those locations and show you what we can work with!