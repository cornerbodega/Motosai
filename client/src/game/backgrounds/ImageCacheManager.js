// Image Cache Manager - Downloads and saves images locally
// This way we only hit the Unsplash API once per location

export class ImageCacheManager {
  constructor() {
    this.cacheManifest = this.loadManifest();
    this.maxCacheSize = 50 * 1024 * 1024; // 50MB max cache size
    this.maxCacheEntries = 20; // Maximum number of cached images
    this.currentCacheSize = 0;
    this.calculateCurrentCacheSize();
  }
  
  loadManifest() {
    // Load manifest from localStorage to track what we've cached
    const manifest = localStorage.getItem('backgroundCacheManifest');
    return manifest ? JSON.parse(manifest) : {};
  }
  
  calculateCurrentCacheSize() {
    this.currentCacheSize = 0;
    for (const segmentId in this.cacheManifest) {
      const entry = this.cacheManifest[segmentId];
      if (entry.size) {
        this.currentCacheSize += entry.size;
      }
    }
  }
  
  saveManifest() {
    localStorage.setItem('backgroundCacheManifest', JSON.stringify(this.cacheManifest));
  }
  
  async downloadAndSaveImage(segmentId, imageUrl) {
    try {
      // Check if we need to clear space first
      await this.ensureCacheSpace();
      
      // Download the image
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error('Failed to download image');
      
      const blob = await response.blob();
      const blobSize = blob.size;
      
      // Check if image is too large
      if (blobSize > this.maxCacheSize / 2) {
        console.warn('Image too large to cache:', blobSize);
        return null;
      }
      
      // Make room if needed
      while (this.currentCacheSize + blobSize > this.maxCacheSize) {
        await this.removeOldestEntry();
      }
      
      // Convert to data URL for storage
      const reader = new FileReader();
      return new Promise((resolve, reject) => {
        reader.onloadend = () => {
          const dataUrl = reader.result;
          
          // Store in localStorage (or IndexedDB for larger files)
          const cacheKey = `background_segment_${segmentId}`;
          
          // For large images, we should use IndexedDB instead
          if (dataUrl.length > 1000000) { // 1MB limit for localStorage
            this.saveToIndexedDB(cacheKey, dataUrl).then(() => {
              this.cacheManifest[segmentId] = {
                type: 'indexeddb',
                key: cacheKey,
                timestamp: Date.now(),
                originalUrl: imageUrl,
                size: blobSize
              };
              this.currentCacheSize += blobSize;
              this.saveManifest();
              resolve(dataUrl);
            });
          } else {
            localStorage.setItem(cacheKey, dataUrl);
            this.cacheManifest[segmentId] = {
              type: 'localStorage',
              key: cacheKey,
              timestamp: Date.now(),
              originalUrl: imageUrl,
              size: blobSize
            };
            this.currentCacheSize += blobSize;
            this.saveManifest();
            resolve(dataUrl);
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Failed to cache image:', error);
      return null;
    }
  }
  
  async getCachedImage(segmentId) {
    const manifestEntry = this.cacheManifest[segmentId];
    if (!manifestEntry) return null;
    
    try {
      if (manifestEntry.type === 'localStorage') {
        return localStorage.getItem(manifestEntry.key);
      } else if (manifestEntry.type === 'indexeddb') {
        return await this.getFromIndexedDB(manifestEntry.key);
      }
    } catch (error) {
      console.error('Failed to retrieve cached image:', error);
      // Remove from manifest if corrupted
      delete this.cacheManifest[segmentId];
      this.saveManifest();
      return null;
    }
  }
  
  async saveToIndexedDB(key, data) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('MotosaiBackgrounds', 1);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('images')) {
          db.createObjectStore('images');
        }
      };
      
      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['images'], 'readwrite');
        const store = transaction.objectStore('images');
        const putRequest = store.put(data, key);
        
        putRequest.onsuccess = () => {
          db.close();
          resolve();
        };
        
        putRequest.onerror = () => {
          db.close();
          reject(putRequest.error);
        };
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  async getFromIndexedDB(key) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('MotosaiBackgrounds', 1);
      
      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['images'], 'readonly');
        const store = transaction.objectStore('images');
        const getRequest = store.get(key);
        
        getRequest.onsuccess = () => {
          db.close();
          resolve(getRequest.result);
        };
        
        getRequest.onerror = () => {
          db.close();
          reject(getRequest.error);
        };
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  clearOldCache(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 days
    const now = Date.now();
    let changed = false;
    
    for (const segmentId in this.cacheManifest) {
      const entry = this.cacheManifest[segmentId];
      if (now - entry.timestamp > maxAge) {
        // Remove old entries
        this.removeEntry(segmentId);
        changed = true;
      }
    }
    
    if (changed) {
      this.saveManifest();
    }
  }
  
  async ensureCacheSpace() {
    // Remove entries if we have too many
    const entries = Object.keys(this.cacheManifest);
    if (entries.length >= this.maxCacheEntries) {
      // Remove oldest entries until we're under the limit
      const sortedEntries = entries.sort((a, b) => {
        return this.cacheManifest[a].timestamp - this.cacheManifest[b].timestamp;
      });
      
      const entriesToRemove = sortedEntries.slice(0, entries.length - this.maxCacheEntries + 1);
      for (const segmentId of entriesToRemove) {
        await this.removeEntry(segmentId);
      }
    }
  }
  
  async removeOldestEntry() {
    const entries = Object.keys(this.cacheManifest);
    if (entries.length === 0) return;
    
    // Find oldest entry
    let oldestId = entries[0];
    let oldestTime = this.cacheManifest[oldestId].timestamp;
    
    for (const segmentId of entries) {
      if (this.cacheManifest[segmentId].timestamp < oldestTime) {
        oldestId = segmentId;
        oldestTime = this.cacheManifest[segmentId].timestamp;
      }
    }
    
    await this.removeEntry(oldestId);
  }
  
  async removeEntry(segmentId) {
    const entry = this.cacheManifest[segmentId];
    if (!entry) return;
    
    // Remove from storage
    if (entry.type === 'localStorage') {
      localStorage.removeItem(entry.key);
    } else if (entry.type === 'indexeddb') {
      await this.removeFromIndexedDB(entry.key);
    }
    
    // Update cache size
    if (entry.size) {
      this.currentCacheSize -= entry.size;
    }
    
    // Remove from manifest
    delete this.cacheManifest[segmentId];
  }
  
  async removeFromIndexedDB(key) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('MotosaiBackgrounds', 1);
      
      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['images'], 'readwrite');
        const store = transaction.objectStore('images');
        const deleteRequest = store.delete(key);
        
        deleteRequest.onsuccess = () => {
          db.close();
          resolve();
        };
        
        deleteRequest.onerror = () => {
          db.close();
          reject(deleteRequest.error);
        };
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  dispose() {
    // Clear all cache on dispose
    for (const segmentId in this.cacheManifest) {
      this.removeEntry(segmentId);
    }
    this.cacheManifest = {};
    this.saveManifest();
  }
}