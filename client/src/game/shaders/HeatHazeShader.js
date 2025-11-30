export const HeatHazeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0.0 },
    distortionAmount: { value: 0.01 },
    speed: { value: 1.0 },
    scale: { value: 1.5 },
    heightFactor: { value: 0.5 } // Controls where haze appears (0 = bottom, 1 = top)
  },

  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float distortionAmount;
    uniform float speed;
    uniform float scale;
    uniform float heightFactor;

    varying vec2 vUv;

    // Simple noise function
    float noise(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    // Smooth noise
    float smoothNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);

      float a = noise(i);
      float b = noise(i + vec2(1.0, 0.0));
      float c = noise(i + vec2(0.0, 1.0));
      float d = noise(i + vec2(1.0, 1.0));

      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    // Fractal noise for more detail
    float fractalNoise(vec2 p) {
      float value = 0.0;
      float amplitude = 1.0;
      float frequency = 1.0;

      for(int i = 0; i < 3; i++) {
        value += amplitude * smoothNoise(p * frequency);
        amplitude *= 0.5;
        frequency *= 2.0;
      }

      return value;
    }

    void main() {
      vec2 uv = vUv;

      // Create vertical gradient - haze is stronger near bottom (road level)
      float verticalGradient = 1.0 - smoothstep(heightFactor - 0.3, heightFactor + 0.2, uv.y);

      // Create horizontal noise pattern
      vec2 noiseCoord = vec2(uv.x * scale, uv.y * scale * 0.3);
      noiseCoord.y += time * speed * 0.1;

      // Generate noise
      float noiseValue = fractalNoise(noiseCoord);

      // Create second layer of noise moving in opposite direction for more realism
      vec2 noiseCoord2 = vec2(uv.x * scale * 1.3, uv.y * scale * 0.4);
      noiseCoord2.y -= time * speed * 0.08;
      float noiseValue2 = fractalNoise(noiseCoord2);

      // Combine noise layers
      float combinedNoise = (noiseValue + noiseValue2 * 0.5) / 1.5;

      // Apply vertical gradient
      float distortion = (combinedNoise - 0.5) * distortionAmount * verticalGradient;

      // Distort UVs
      vec2 distortedUV = uv + vec2(distortion * 0.3, distortion);

      // Sample texture with distorted UVs
      vec4 color = texture2D(tDiffuse, distortedUV);

      gl_FragColor = color;
    }
  `
};
