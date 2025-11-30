import * as THREE from 'three';

/**
 * Comprehensive disposal utilities for Three.js objects
 * Ensures proper cleanup of all resources to prevent memory leaks
 */

/**
 * Dispose a Three.js geometry
 * @param {THREE.BufferGeometry} geometry - The geometry to dispose
 */
export function disposeGeometry(geometry) {
  if (!geometry) return;

  // Dispose all attributes
  if (geometry.attributes) {
    for (const attribute of Object.values(geometry.attributes)) {
      if (attribute && attribute.array) {
        // Clear the array reference
        attribute.array = null;
      }
    }
  }

  // Dispose index
  if (geometry.index) {
    if (geometry.index.array) {
      geometry.index.array = null;
    }
  }

  // Call Three.js dispose
  if (typeof geometry.dispose === 'function') {
    geometry.dispose();
  }
}

/**
 * Dispose a Three.js material
 * @param {THREE.Material|Array} material - The material(s) to dispose
 */
export function disposeMaterial(material) {
  if (!material) return;

  // Handle array of materials
  if (Array.isArray(material)) {
    material.forEach(mat => disposeMaterial(mat));
    return;
  }

  // Dispose textures used by the material
  const texturesToDispose = [
    'map',
    'lightMap',
    'bumpMap',
    'normalMap',
    'specularMap',
    'envMap',
    'alphaMap',
    'aoMap',
    'emissiveMap',
    'metalnessMap',
    'roughnessMap',
    'clearcoatMap',
    'clearcoatNormalMap',
    'clearcoatRoughnessMap',
    'displacementMap',
    'transmissionMap',
    'thicknessMap'
  ];

  for (const textureProperty of texturesToDispose) {
    if (material[textureProperty]) {
      disposeTexture(material[textureProperty]);
      material[textureProperty] = null;
    }
  }

  // Dispose uniforms if they exist (for ShaderMaterial)
  if (material.uniforms) {
    for (const uniform of Object.values(material.uniforms)) {
      if (uniform && uniform.value) {
        if (uniform.value.dispose) {
          uniform.value.dispose();
        }
      }
    }
  }

  // Call Three.js dispose
  if (typeof material.dispose === 'function') {
    material.dispose();
  }
}

/**
 * Dispose a Three.js texture
 * @param {THREE.Texture} texture - The texture to dispose
 */
export function disposeTexture(texture) {
  if (!texture) return;

  // Clear image reference
  if (texture.image) {
    // If it's a canvas, clear it
    if (texture.image instanceof HTMLCanvasElement) {
      const ctx = texture.image.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, texture.image.width, texture.image.height);
      }
    }
    texture.image = null;
  }

  // Clear mipmaps
  if (texture.mipmaps) {
    texture.mipmaps = [];
  }

  // Call Three.js dispose
  if (typeof texture.dispose === 'function') {
    texture.dispose();
  }
}

/**
 * Dispose a Three.js mesh and all its resources
 * @param {THREE.Mesh} mesh - The mesh to dispose
 * @param {boolean} disposeGeometryFlag - Whether to dispose geometry
 * @param {boolean} disposeMaterialFlag - Whether to dispose material
 */
export function disposeMesh(mesh, disposeGeometryFlag = true, disposeMaterialFlag = true) {
  if (!mesh) return;

  // Remove from parent if exists
  if (mesh.parent) {
    mesh.parent.remove(mesh);
  }

  // Dispose geometry
  if (disposeGeometryFlag && mesh.geometry) {
    disposeGeometry(mesh.geometry);
    mesh.geometry = null;
  }

  // Dispose material
  if (disposeMaterialFlag && mesh.material) {
    disposeMaterial(mesh.material);
    mesh.material = null;
  }

  // Clear any custom properties that might hold references
  if (mesh.userData) {
    mesh.userData = {};
  }
}

/**
 * Recursively dispose a Three.js object and all its children
 * @param {THREE.Object3D} object - The object to dispose
 * @param {boolean} disposeGeometry - Whether to dispose geometries
 * @param {boolean} disposeMaterial - Whether to dispose materials
 */
export function disposeObject3D(object, disposeGeometry = true, disposeMaterial = true) {
  if (!object) return;

  // Dispose children first
  while (object.children.length > 0) {
    disposeObject3D(object.children[0], disposeGeometry, disposeMaterial);
  }

  // Dispose the object itself if it's a mesh
  if (object instanceof THREE.Mesh) {
    disposeMesh(object, disposeGeometry, disposeMaterial);
  } else if (object instanceof THREE.Line || object instanceof THREE.Points) {
    if (disposeGeometry && object.geometry) {
      disposeGeometry(object.geometry);
    }
    if (disposeMaterial && object.material) {
      disposeMaterial(object.material);
    }
  } else if (object instanceof THREE.Sprite) {
    if (disposeMaterial && object.material) {
      disposeMaterial(object.material);
    }
  }

  // Remove from parent
  if (object.parent) {
    object.parent.remove(object);
  }

  // Clear user data
  if (object.userData) {
    object.userData = {};
  }

  // Clear any callbacks or event listeners
  if (object.onBeforeRender) {
    object.onBeforeRender = () => {};
  }
  if (object.onAfterRender) {
    object.onAfterRender = () => {};
  }
}

/**
 * Dispose a Three.js render target
 * @param {THREE.WebGLRenderTarget} renderTarget - The render target to dispose
 */
export function disposeRenderTarget(renderTarget) {
  if (!renderTarget) return;

  // Dispose texture
  if (renderTarget.texture) {
    disposeTexture(renderTarget.texture);
  }

  // Dispose depth texture
  if (renderTarget.depthTexture) {
    disposeTexture(renderTarget.depthTexture);
  }

  // Call Three.js dispose
  if (typeof renderTarget.dispose === 'function') {
    renderTarget.dispose();
  }
}

/**
 * Clean up a scene completely
 * @param {THREE.Scene} scene - The scene to clean
 * @param {boolean} disposeGeometry - Whether to dispose geometries
 * @param {boolean} disposeMaterial - Whether to dispose materials
 */
export function disposeScene(scene, disposeGeometry = true, disposeMaterial = true) {
  if (!scene) return;

  // Dispose all children
  while (scene.children.length > 0) {
    disposeObject3D(scene.children[0], disposeGeometry, disposeMaterial);
  }

  // Dispose environment map
  if (scene.environment) {
    disposeTexture(scene.environment);
    scene.environment = null;
  }

  // Dispose background
  if (scene.background && scene.background.isTexture) {
    disposeTexture(scene.background);
    scene.background = null;
  }

  // Clear fog if exists
  if (scene.fog) {
    scene.fog = null;
  }

  // Clear overridden material
  if (scene.overrideMaterial) {
    disposeMaterial(scene.overrideMaterial);
    scene.overrideMaterial = null;
  }
}

/**
 * Dispose a renderer
 * @param {THREE.WebGLRenderer} renderer - The renderer to dispose
 */
export function disposeRenderer(renderer) {
  if (!renderer) return;

  // Clear any render targets
  renderer.setRenderTarget(null);

  // Dispose the renderer
  if (typeof renderer.dispose === 'function') {
    renderer.dispose();
  }

  // Clear the DOM element
  if (renderer.domElement && renderer.domElement.parentNode) {
    renderer.domElement.parentNode.removeChild(renderer.domElement);
  }

  // Force context loss
  const gl = renderer.getContext();
  if (gl) {
    const loseContext = gl.getExtension('WEBGL_lose_context');
    if (loseContext) {
      loseContext.loseContext();
    }
  }
}

/**
 * Memory leak detector for Three.js objects
 * Tracks resource creation and disposal
 */
export class MemoryLeakDetector {
  constructor() {
    this.trackedObjects = new WeakMap();
    this.statistics = {
      geometriesCreated: 0,
      geometriesDisposed: 0,
      materialsCreated: 0,
      materialsDisposed: 0,
      texturesCreated: 0,
      texturesDisposed: 0
    };
  }

  /**
   * Track a resource
   * @param {Object} resource - The resource to track
   * @param {string} type - Type of resource
   */
  track(resource, type) {
    this.trackedObjects.set(resource, {
      type,
      createdAt: Date.now(),
      stack: new Error().stack
    });

    switch (type) {
      case 'geometry':
        this.statistics.geometriesCreated++;
        break;
      case 'material':
        this.statistics.materialsCreated++;
        break;
      case 'texture':
        this.statistics.texturesCreated++;
        break;
    }
  }

  /**
   * Mark a resource as disposed
   * @param {Object} resource - The resource that was disposed
   */
  disposed(resource) {
    const info = this.trackedObjects.get(resource);
    if (!info) return;

    switch (info.type) {
      case 'geometry':
        this.statistics.geometriesDisposed++;
        break;
      case 'material':
        this.statistics.materialsDisposed++;
        break;
      case 'texture':
        this.statistics.texturesDisposed++;
        break;
    }
  }

  /**
   * Get current statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      ...this.statistics,
      geometryLeaks: this.statistics.geometriesCreated - this.statistics.geometriesDisposed,
      materialLeaks: this.statistics.materialsCreated - this.statistics.materialsDisposed,
      textureLeaks: this.statistics.texturesCreated - this.statistics.texturesDisposed
    };
  }

  /**
   * Reset statistics
   */
  reset() {
    this.statistics = {
      geometriesCreated: 0,
      geometriesDisposed: 0,
      materialsCreated: 0,
      materialsDisposed: 0,
      texturesCreated: 0,
      texturesDisposed: 0
    };
  }
}

// Global memory leak detector instance
export const memoryLeakDetector = new MemoryLeakDetector();

/**
 * Patch Three.js constructors to track creation
 * Call this once at app initialization
 */
export function patchThreeJSForTracking() {
  // Store original constructors
  const originalBoxGeometry = THREE.BoxGeometry;
  const originalSphereGeometry = THREE.SphereGeometry;
  const originalPlaneGeometry = THREE.PlaneGeometry;
  const originalMeshStandardMaterial = THREE.MeshStandardMaterial;
  const originalMeshBasicMaterial = THREE.MeshBasicMaterial;

  // Patch geometries
  THREE.BoxGeometry = function(...args) {
    const geometry = new originalBoxGeometry(...args);
    memoryLeakDetector.track(geometry, 'geometry');
    return geometry;
  };

  THREE.SphereGeometry = function(...args) {
    const geometry = new originalSphereGeometry(...args);
    memoryLeakDetector.track(geometry, 'geometry');
    return geometry;
  };

  THREE.PlaneGeometry = function(...args) {
    const geometry = new originalPlaneGeometry(...args);
    memoryLeakDetector.track(geometry, 'geometry');
    return geometry;
  };

  // Patch materials
  THREE.MeshStandardMaterial = function(...args) {
    const material = new originalMeshStandardMaterial(...args);
    memoryLeakDetector.track(material, 'material');
    return material;
  };

  THREE.MeshBasicMaterial = function(...args) {
    const material = new originalMeshBasicMaterial(...args);
    memoryLeakDetector.track(material, 'material');
    return material;
  };
}