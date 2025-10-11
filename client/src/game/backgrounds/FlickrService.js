// Flickr API Service for fetching CC-licensed photos
// This is the hardest part - if we can't get good photos, the whole concept fails

export class FlickrService {
  constructor(apiKey = null) {
    // You'll need to get a free API key from https://www.flickr.com/services/api/
    this.apiKey = apiKey || 'YOUR_FLICKR_API_KEY';
    this.baseUrl = 'https://api.flickr.com/services/rest/';
    this.cache = new Map();
  }

  async fetchPhotosForLocation(lat, lng, radiusKm = 5) {
    const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      console.log(`Using cached photos for ${cacheKey}`);
      return this.cache.get(cacheKey);
    }

    try {
      const params = new URLSearchParams({
        method: 'flickr.photos.search',
        api_key: this.apiKey,
        lat: lat,
        lon: lng,
        radius: radiusKm,
        radius_units: 'km',
        // CC licenses: BY, BY-SA, BY-ND, BY-NC, BY-NC-SA, BY-NC-ND
        license: '1,2,3,4,5,6',
        tags: 'coast,ocean,highway,pacific,panorama,landscape',
        tag_mode: 'any',
        sort: 'interestingness-desc',
        extras: 'url_l,url_o,geo,tags,views,owner_name,license,date_taken',
        per_page: 50,
        format: 'json',
        nojsoncallback: 1,
        content_type: 1, // photos only
        media: 'photos'
      });

      const response = await fetch(`${this.baseUrl}?${params}`);
      const data = await response.json();

      if (data.stat !== 'ok') {
        throw new Error(`Flickr API error: ${data.message}`);
      }

      // Validate and score photos
      const validPhotos = data.photos.photo
        .map(photo => this.validateAndScorePhoto(photo))
        .filter(photo => photo !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5); // Keep top 5

      this.cache.set(cacheKey, validPhotos);
      return validPhotos;

    } catch (error) {
      console.error('Error fetching Flickr photos:', error);
      return this.getFallbackGradient(lat, lng);
    }
  }

  validateAndScorePhoto(photo) {
    // Must have large size URL
    if (!photo.url_l && !photo.url_o) {
      return null;
    }

    const url = photo.url_o || photo.url_l;
    const width = parseInt(photo.width_o || photo.width_l || 0);
    const height = parseInt(photo.height_o || photo.height_l || 0);

    // Minimum resolution check
    if (width < 1920 || height < 600) {
      return null;
    }

    // Calculate aspect ratio (prefer panoramic)
    const aspectRatio = width / height;
    if (aspectRatio < 2.0) {
      return null; // Not panoramic enough
    }

    // Score the photo
    let score = 0;
    
    // Aspect ratio score (3:1 is ideal)
    const idealAspect = 3.0;
    score += Math.max(0, 100 - Math.abs(aspectRatio - idealAspect) * 50);
    
    // Resolution score
    score += Math.min(50, width / 100);
    
    // Popularity score
    score += Math.min(30, parseInt(photo.views || 0) / 1000);
    
    // Tag relevance score
    const goodTags = ['ocean', 'coast', 'pacific', 'highway', 'panorama', 'sunset', 'sunrise'];
    const tags = (photo.tags || '').toLowerCase().split(' ');
    const tagMatches = tags.filter(tag => goodTags.includes(tag)).length;
    score += tagMatches * 10;

    // Time of day preference (from EXIF if available)
    const dateTaken = photo.datetaken || '';
    const hour = parseInt(dateTaken.split(' ')[1]?.split(':')[0] || 12);
    if (hour >= 6 && hour <= 18) {
      score += 20; // Daytime bonus
    }

    return {
      id: photo.id,
      url: url,
      width: width,
      height: height,
      aspectRatio: aspectRatio,
      owner: photo.ownername || 'Unknown',
      license: this.getLicenseText(photo.license),
      score: score,
      title: photo.title || 'Untitled',
      tags: photo.tags,
      lat: parseFloat(photo.latitude || 0),
      lng: parseFloat(photo.longitude || 0)
    };
  }

  getLicenseText(licenseId) {
    const licenses = {
      '1': 'CC BY-NC-SA',
      '2': 'CC BY-NC',
      '3': 'CC BY-NC-ND',
      '4': 'CC BY',
      '5': 'CC BY-SA',
      '6': 'CC BY-ND',
      '7': 'No known copyright',
      '9': 'CC0',
      '10': 'Public Domain'
    };
    return licenses[licenseId] || 'Unknown License';
  }

  getFallbackGradient(lat, lng) {
    // Generate a gradient based on latitude (north = cooler, south = warmer)
    const latNorm = (lat - 32) / (48 - 32); // Normalize between southern and northern latitudes
    
    return [{
      id: 'gradient_' + Date.now(),
      url: null,
      gradient: {
        top: this.interpolateColor('#4A90E2', '#87CEEB', latNorm),    // Sky
        middle: this.interpolateColor('#5BA0F2', '#98D8F8', latNorm),  // Horizon
        bottom: this.interpolateColor('#2E5D8B', '#4682B4', latNorm)   // Ocean
      },
      width: 1920,
      height: 640,
      aspectRatio: 3,
      owner: 'Procedural',
      license: 'Generated',
      score: 0,
      title: `Generated gradient for ${lat.toFixed(2)}, ${lng.toFixed(2)}`
    }];
  }

  interpolateColor(color1, color2, factor) {
    // Simple color interpolation
    const c1 = parseInt(color1.slice(1), 16);
    const c2 = parseInt(color2.slice(1), 16);
    
    const r1 = (c1 >> 16) & 0xff;
    const g1 = (c1 >> 8) & 0xff;
    const b1 = c1 & 0xff;
    
    const r2 = (c2 >> 16) & 0xff;
    const g2 = (c2 >> 8) & 0xff;
    const b2 = c2 & 0xff;
    
    const r = Math.round(r1 + (r2 - r1) * factor);
    const g = Math.round(g1 + (g2 - g1) * factor);
    const b = Math.round(b1 + (b2 - b1) * factor);
    
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }

  async preloadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  // Test function to verify API is working
  async testAPI() {
    console.log('Testing Flickr API...');
    
    // Test with Big Sur coordinates
    const testLocations = [
      { name: 'Big Sur', lat: 36.2704, lng: -121.8081 },
      { name: 'Golden Gate', lat: 37.8199, lng: -122.4783 },
      { name: 'Malibu', lat: 34.0259, lng: -118.7798 }
    ];

    for (const loc of testLocations) {
      console.log(`\nFetching photos for ${loc.name}...`);
      const photos = await this.fetchPhotosForLocation(loc.lat, loc.lng);
      console.log(`Found ${photos.length} suitable photos:`);
      photos.forEach(p => {
        console.log(`  - ${p.title} (${p.width}x${p.height}, score: ${p.score.toFixed(1)})`);
      });
    }
  }
}

// Export for testing
if (typeof window !== 'undefined') {
  window.FlickrService = FlickrService;
}