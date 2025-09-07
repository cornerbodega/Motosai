// Unsplash API Service - Actually FREE and working!
// Better than Flickr - no Pro subscription needed

export class UnsplashService {
  constructor() {
    // Unsplash gives you 50 requests/hour for free (demo rate)
    // Just register at https://unsplash.com/developers
    this.accessKey = 'qFxcvfJy07a1t-xwRjHV4EzbQUgJJyWeM9-wyOBHf5w';
    this.baseUrl = 'https://api.unsplash.com';
    this.cache = new Map();
    this.maxCacheSize = 10; // Limit cache to prevent memory buildup
    
    // For immediate testing without API key
    this.USE_MOCK_DATA = !this.accessKey || this.accessKey === 'YOUR_UNSPLASH_ACCESS_KEY';
  }

  async fetchPhotosForLocation(lat, lng, location_name = '') {
    // Don't cache by location - let BackgroundSystem handle caching by segment
    // This ensures we get fresh photos for each segment
    // const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    
    // if (this.cache.has(cacheKey)) {
    //   return this.cache.get(cacheKey);
    // }

    // If no API key, return mock data for testing
    if (this.USE_MOCK_DATA) {
      console.log('[Unsplash] Using MOCK data');
      return this.getMockPhotos(lat, lng, location_name);
    }

    try {
      // Unsplash doesn't have GPS search, but we can search by location name
      const searchQuery = this.getSearchQuery(lat, lng, location_name);
      // console.log('[Unsplash] Fetching photos for:', searchQuery);
      // console.log('[Unsplash] Using API key:', this.accessKey ? 'Yes' : 'No');
      
      const response = await fetch(
        `${this.baseUrl}/search/photos?query=${searchQuery}&per_page=30&orientation=landscape`,
        {
          headers: {
            'Authorization': `Client-ID ${this.accessKey}`,
            'Accept-Version': 'v1'
          }
        }
      );

      if (!response.ok) {
        console.error(`[Unsplash] API error: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.error(`[Unsplash] Error details:`, errorText);
        throw new Error(`Unsplash API error: ${response.status}`);
      }

      const data = await response.json();
      // console.log('[Unsplash] API response: ', data.results?.length || 0, 'results');
      
      // Validate and score photos - get more variety
      const validPhotos = data.results
        .map(photo => this.processPhoto(photo))
        .filter(photo => photo !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);  // Get more photos for variety

      // console.log('[Unsplash] Valid photos after filtering:', validPhotos.length);
      
      // Don't cache - let BackgroundSystem handle caching by segment
      // // Limit cache size to prevent memory buildup
      // if (this.cache.size >= this.maxCacheSize) {
      //   // Remove oldest entry
      //   const firstKey = this.cache.keys().next().value;
      //   this.cache.delete(firstKey);
      // }
      // 
      // this.cache.set(cacheKey, validPhotos);
      return validPhotos;

    } catch (error) {
      console.error('[Unsplash] API FAILED, using mock. Error:', error.message);
      return this.getMockPhotos(lat, lng, location_name);
    }
  }

  processPhoto(photo) {
    // Get smaller size URL for better performance
    const url = photo.urls.regular || photo.urls.small;
    const width = photo.width;
    const height = photo.height;
    
    // Check minimum requirements
    if (width < 1920 || height < 600) {
      return null;
    }
    
    const aspectRatio = width / height;
    if (aspectRatio < 1.5) {
      return null; // Not wide enough
    }

    // Score the photo
    let score = 0;
    score += Math.min(100, (aspectRatio - 1.5) * 50); // Prefer panoramic
    score += Math.min(50, photo.likes / 10); // Popularity
    score += photo.blur_hash ? 10 : 0; // Has blur preview
    
    return {
      id: photo.id,
      url: url,
      preview: photo.urls.small,
      width: width,
      height: height,
      aspectRatio: aspectRatio,
      author: photo.user.name,
      authorUrl: photo.user.links.html,
      downloadUrl: photo.links.download_location,
      score: score,
      description: photo.description || photo.alt_description || '',
      color: photo.color, // Dominant color
      blurHash: photo.blur_hash // For smooth loading
    };
  }

  getSearchQuery(lat, lng, location_name) {
    // Map coordinates to location names for better search results
    const locations = {
      47.6: 'seattle coast pacific northwest ocean',
      45.5: 'oregon coast cannon beach haystack rock',
      41.9: 'redwood coast northern california',
      37.8: 'golden gate san francisco bay',
      36.5: 'big sur california coast highway',
      36.2: 'monterey california pacific',
      35.5: 'san luis obispo california coast',
      34.4: 'santa barbara california beach',
      34.0: 'malibu california pacific coast',
      33.7: 'laguna beach california ocean',
      32.7: 'san diego california coast sunset'
    };
    
    // Find closest location
    let closestLat = 47.6;
    let minDiff = 999;
    for (const testLat in locations) {
      const diff = Math.abs(lat - parseFloat(testLat));
      if (diff < minDiff) {
        minDiff = diff;
        closestLat = testLat;
      }
    }
    
    return encodeURIComponent(location_name || locations[closestLat]);
  }

  getMockPhotos(lat, lng, location_name) {
    // console.log(`[Unsplash] Generating mock gradients for lat:${lat}, lng:${lng}`);
    // Generate beautiful gradients based on latitude
    // This works without any API key!
    
    const latNorm = (lat - 32.7) / (47.6 - 32.7); // Normalize between SD and Seattle
    
    // Use lat/lng to generate more variety
    const seed = Math.abs(Math.sin(lat * 100) * Math.cos(lng * 100));
    const variant = Math.floor(seed * 10) % 5;
    
    // Different gradient styles based on location
    const gradients = [
      {
        // Dawn gradient
        id: 'gradient_dawn_' + Date.now(),
        type: 'gradient',
        gradient: {
          angle: 180,
          stops: [
            { color: '#FF6B6B', position: 0 },
            { color: '#FFE66D', position: 0.3 },
            { color: '#4ECDC4', position: 0.7 },
            { color: '#1E6BA8', position: 1 }
          ]
        },
        width: 2400,
        height: 800,
        aspectRatio: 3,
        author: 'Procedural Generator',
        score: 50,
        description: `${location_name || 'Coast'} - Dawn`
      },
      {
        // Ocean gradient
        id: 'gradient_ocean_' + Date.now(),
        type: 'gradient',
        gradient: {
          angle: 180,
          stops: [
            { color: this.interpolateColor('#87CEEB', '#4A90E2', latNorm), position: 0 },
            { color: this.interpolateColor('#98D8F8', '#5BA0F2', latNorm), position: 0.4 },
            { color: this.interpolateColor('#5BA0F2', '#3A7BD5', latNorm), position: 0.6 },
            { color: this.interpolateColor('#4682B4', '#2E5D8B', latNorm), position: 1 }
          ]
        },
        width: 2400,
        height: 800,
        aspectRatio: 3,
        author: 'Procedural Generator',
        score: 40,
        description: `${location_name || 'Pacific Ocean'} - Midday`
      },
      {
        // Sunset gradient
        id: 'gradient_sunset_' + Date.now(),
        type: 'gradient',
        gradient: {
          angle: 180,
          stops: [
            { color: '#FF9A56', position: 0 },
            { color: '#FF6B9D', position: 0.3 },
            { color: '#C44569', position: 0.6 },
            { color: '#723C70', position: 1 }
          ]
        },
        width: 2400,
        height: 800,
        aspectRatio: 3,
        author: 'Procedural Generator',
        score: 60,
        description: `${location_name || 'Coast'} - Sunset`
      }
    ];
    
    // Don't add test photos that don't exist
    // gradients.push({
    //   id: 'test_photo_' + Date.now(),
    //   url: '/test-images/coast-' + Math.floor(Math.random() * 3 + 1) + '.jpg',
    //   type: 'photo',
    //   width: 2400,
    //   height: 800,
    //   aspectRatio: 3,
    //   author: 'Test Photo',
    //   score: 30,
    //   description: 'Test coastal photo'
    // });
    
    return gradients;
  }

  interpolateColor(color1, color2, factor) {
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

  // Create a Three.js texture from gradient data
  createGradientTexture(gradient, width = 512, height = 256) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // Create gradient
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    gradient.stops.forEach(stop => {
      grad.addColorStop(stop.position, stop.color);
    });
    
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    
    return canvas;
  }
}

// Alternative: Pexels API (also free!)
export class PexelsService {
  constructor() {
    // Get free API key at https://www.pexels.com/api/
    this.apiKey = 'YOUR_PEXELS_API_KEY';
    this.baseUrl = 'https://api.pexels.com/v1';
  }
  
  async fetchPhotosForLocation(lat, lng, location_name = '') {
    // Similar to Unsplash but with 200 requests/hour free limit
    // Implementation would be similar...
  }
}

// Export for testing
if (typeof window !== 'undefined') {
  window.UnsplashService = UnsplashService;
  window.PexelsService = PexelsService;
}