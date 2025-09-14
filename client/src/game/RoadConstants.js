// Shared constants for road and traffic systems - DRY principle
export const ROAD_CONSTANTS = {
  // Lane configuration
  LANE_WIDTH: 4.5, // meters - wider lanes for easier driving
  NUM_LANES: 3, // 3 lanes all same direction
  NUM_SUBLANES: 3, // 3 sub-lanes within each lane (left, center, right)
  SUBLANE_WIDTH: 1.5, // Each sub-lane is 1.5m wide (4.5m / 3)
  SHOULDER_WIDTH: 2.5, // Slightly wider shoulders too
  
  // Calculated values
  get TOTAL_WIDTH() {
    return this.LANE_WIDTH * this.NUM_LANES + this.SHOULDER_WIDTH * 2;
  },
  
  // Barrier positions (beyond shoulders)
  BARRIER_OFFSET: 1.0, // Extra distance beyond shoulders
  get LEFT_BARRIER_X() {
    return -(this.TOTAL_WIDTH / 2 + this.BARRIER_OFFSET);
  },
  get RIGHT_BARRIER_X() {
    return this.TOTAL_WIDTH / 2 + this.BARRIER_OFFSET;
  },
  
  // Lane center positions
  getLanePosition(lane) {
    // Returns x position for given lane (0-2 for 3 lanes)
    return (lane - 1) * this.LANE_WIDTH; // Lane 0 is left, 1 is center, 2 is right
  },
  
  // Sub-lane positions within a lane
  getSubLaneOffset(subLane) {
    // subLane: 0 = left, 1 = center, 2 = right
    // Returns offset from lane center
    return (subLane - 1) * this.SUBLANE_WIDTH; // -1.5, 0, or +1.5
  },
  
  // Get exact position for lane + sub-lane combination
  getExactPosition(lane, subLane) {
    return this.getLanePosition(lane) + this.getSubLaneOffset(subLane);
  },
  
  // Convert continuous X position to nearest lane and sub-lane
  getPositionInfo(x) {
    // Find main lane
    const lane = Math.round(x / this.LANE_WIDTH) + 1;
    const clampedLane = Math.max(0, Math.min(2, lane));
    
    // Find sub-lane within that lane
    const laneCenter = this.getLanePosition(clampedLane);
    const offsetFromCenter = x - laneCenter;
    const subLane = Math.round(offsetFromCenter / this.SUBLANE_WIDTH) + 1;
    const clampedSubLane = Math.max(0, Math.min(2, subLane));
    
    return { lane: clampedLane, subLane: clampedSubLane };
  },
  
  // Strategic positioning for traffic blocking (deprecated - use sub-lanes instead)
  getAggressiveOffset(lane) {
    // This is now handled by sub-lane positioning
    // Left lane cars use subLane 0 (left), right lane cars use subLane 2 (right)
    return 0; // No additional offset needed with sub-lane system
  },
  
  // Road surface
  ROAD_Y: 0.5, // Standard height for vehicles
  
  // Physics boundaries (for collision detection)
  get ROAD_HALF_WIDTH() {
    return this.TOTAL_WIDTH / 2;
  }
};