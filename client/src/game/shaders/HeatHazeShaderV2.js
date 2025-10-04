export const HeatHazeShaderV2 = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0.0 },
    distortionAmount: { value: 0.02 },
    frequency: { value: 4.0 },
    speed: { value: 1.0 },
    heightFactor: { value: 0.5 },
    bikeExclusionRadius: { value: 0.15 }
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
    uniform float frequency;
    uniform float speed;
    uniform float heightFactor;
    uniform float bikeExclusionRadius;

    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;

      // Vertical gradient - stronger near bottom (road), more spread out
      float verticalGradient = 1.0 - smoothstep(heightFactor - 0.4, heightFactor + 0.3, uv.y);

      // Bike exclusion - softer, more gradual mask
      vec2 center = vec2(0.5, 0.6); // Bike position
      float distFromCenter = distance(uv, center);
      float bikeMask = 1.0 - smoothstep(bikeExclusionRadius - 0.1, bikeExclusionRadius + 0.15, distFromCenter);

      // Add horizontal variation to make waves less uniform
      float horizontalVariation = sin(uv.x * 3.0) * 0.5 + 0.5;

      // Create horizontal waves with more variation
      float wave1 = sin(uv.y * frequency + time * speed + uv.x * 2.0) * 0.4;
      float wave2 = sin(uv.y * frequency * 1.5 - time * speed * 0.7 + uv.x * 1.5) * 0.3;
      float wave3 = sin(uv.y * frequency * 2.2 + time * speed * 1.3 - uv.x * 1.8) * 0.2;
      float wave4 = sin(uv.y * frequency * 0.8 - time * speed * 0.5 + uv.x * 0.9) * 0.1;

      float combinedWave = (wave1 + wave2 + wave3 + wave4) * horizontalVariation;

      // Create horizontal distortion (waves moving left-right)
      float distortion = combinedWave * distortionAmount * verticalGradient * bikeMask;

      // Apply distortion in X direction (horizontal shimmer)
      vec2 distortedUV = uv + vec2(distortion, 0.0);

      // Sample texture with distorted UVs
      vec4 color = texture2D(tDiffuse, distortedUV);

      gl_FragColor = color;
    }
  `
};
