# Billboard System Update - October 14, 2025

## Overview
Integrated new custom billboard textures into the Motosai game, replacing the default placeholder billboards with creative advertising content including the "AI SLOP" magazine and various humorous advertisements.

## Textures Added
The following billboard textures are now available in the game:

1. **ai-slop-mag.jpg** - AI SLOP magazine advertisement
2. **balding-flaming-hairspray.jpg** - Hairspray product ad
3. **hungry.jpg** - Food/restaurant advertisement
4. **injury.jpg** - Medical/insurance advertisement
5. **marker.jpg** - Marker product advertisement
6. **middle-shoe.jpg** - Footwear advertisement
7. **silence.jpg** - Minimalist/contemplative ad
8. **teriyaki-toothpaste.jpg** - Unusual toothpaste flavor ad
9. **time-machine.jpg** - Futuristic product advertisement
10. **wet-cat.jpg** - Humorous pet-related ad
11. **default.png** - Fallback texture

## Technical Implementation

### File Locations
- **Textures Directory**: `/client/public/textures/billboards/`
- **Billboard System**: `/client/src/game/BillboardSystem.js`
- **Game Initialization**: `/client/src/game/MotosaiGame.js`

### How Billboard Selection Works
1. The `BillboardSystem` maintains a hardcoded array of available textures
2. When billboards are created, textures are randomly selected from this array
3. Each billboard can be one of three types:
   - **large-dual**: Two spotlights, two support posts
   - **large-single**: One central spotlight, one post
   - **small**: No lights, single post

### Billboard Rendering System
- **Load Distance**: 400 meters (billboards load when player is within this range)
- **Unload Distance**: 600 meters (billboards unload beyond this range)
- **Culling**: Billboards 50m behind player are hidden but remain cached
- **Max Loaded**: 5 billboards maximum loaded at once (memory optimization)

## How to Add New Billboard Textures

### Step 1: Add the Image File
Place your new billboard texture (JPG or PNG) in:
```
/client/public/textures/billboards/
```

Recommended specs:
- Format: JPG for photos, PNG for graphics with transparency
- Resolution: 1024x512 pixels or similar aspect ratio
- File size: Under 1MB for optimal loading

### Step 2: Update the Billboard System
Edit `/client/src/game/BillboardSystem.js`:

1. Find the `createTestBillboards` method (around line 304)
2. Add your texture filename to the `billboardTextures` array:
```javascript
const billboardTextures = [
  "ai-slop-mag.jpg",
  "balding-flaming-hairspray.jpg",
  // ... other textures ...
  "your-new-texture.jpg",  // <-- Add here
  "default.png"
];
```

3. Also update the `getAvailableTextures` method (around line 422):
```javascript
getAvailableTextures() {
  return [
    "ai-slop-mag.jpg",
    "balding-flaming-hairspray.jpg",
    // ... other textures ...
    "your-new-texture.jpg",  // <-- Add here too
    "default.png"
  ];
}
```

### Step 3: Refresh the Game
After making these changes, refresh your browser to see the new billboards in rotation.

## Billboard System Features

### Dynamic Loading
- Billboards are loaded/unloaded based on player distance
- Textures are cached for performance
- Memory-efficient: only nearby billboards are rendered

### Lighting System
- Billboard lights turn ON at dusk and night
- Billboard lights turn OFF at dawn and day
- Automatic time-of-day synchronization

### Performance Optimizations
- Shared geometry across all billboards
- Texture caching with memory limits
- Distance-based culling
- Maximum loaded billboard limit

## Configuration Options

In `MotosaiGame.js` (line 1383), you can adjust:
- **Count**: Number of billboards to create
- **Spacing**: Distance between billboards in meters

```javascript
// Create 10 billboards with 500m spacing
this.billboardSystem.createTestBillboards(10, 500);
```

## Alternative Billboard Creation Methods

### Method 1: Random Selection (Default)
```javascript
this.billboardSystem.createTestBillboards(10, 500);
```

### Method 2: Specific Sequence
```javascript
const textures = [
  "ai-slop-mag.jpg",
  "wet-cat.jpg",
  "teriyaki-toothpaste.jpg"
];
this.billboardSystem.createBillboardsWithTextures(textures, 500, 100);
```

### Method 3: All Textures in Order
```javascript
const allTextures = this.billboardSystem.getAvailableTextures();
this.billboardSystem.createBillboardsWithTextures(allTextures, 500, 100);
```

## Future Improvements (TODO)

### Dynamic Texture Loading
A dynamic loading system was partially implemented but reverted for stability:
- Server endpoint: `/api/billboards/textures` (in `/server/server.js`)
- Automatically scans billboard folder
- Returns available textures as JSON
- Can be re-enabled for automatic texture discovery

### Database Integration
- Store billboard configurations in Supabase
- Dynamic billboard placement based on game segments
- User-submitted billboard content
- Sponsored billboard slots

### Advanced Features
- Animated billboard textures
- Video billboards
- Interactive billboards (clickable for rewards)
- Billboard damage/destruction physics
- Day/night specific textures
- Weather-reactive billboards

## Testing Billboard Textures

To test your billboard setup:
1. Start the game
2. Drive forward on the highway
3. Billboards should appear on both sides of the road
4. Check browser console for any texture loading errors
5. Verify different textures are appearing randomly

## Troubleshooting

### Billboards showing only default texture:
- Verify texture files exist in `/client/public/textures/billboards/`
- Check filenames match exactly (case-sensitive)
- Clear browser cache and refresh
- Check browser console for 404 errors

### Billboards not appearing:
- Check `BillboardSystem` is initialized in `MotosaiGame.js`
- Verify `createTestBillboards()` is called
- Check browser console for JavaScript errors
- Ensure Three.js scene is rendering properly

### Performance issues:
- Reduce billboard count
- Increase spacing between billboards
- Lower `maxLoadedBillboards` in `BillboardSystem`
- Use smaller texture files

## Credits
Billboard textures created and integrated on October 14, 2025
System designed for memory efficiency and visual variety in the Motosai racing game.