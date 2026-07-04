window.Atoms = window.Atoms || {};

window.Atoms.WindField = {
  sample(config, position, time) {
    const scale = Math.max(40, config.windScale);
    const t = time * config.windSpeed;
    const x = position.x / scale;
    const y = position.y / scale;
    const z = position.z / scale;
    const broad = this.valueNoise3(x * 0.85 + t * 0.34, y * 0.85 - t * 0.18, z * 0.85 + t * 0.21);
    const medium = this.valueNoise3(x * 1.8 - t * 0.62, y * 1.8 + t * 0.31, z * 1.8 - t * 0.27);
    const fine = this.valueNoise3(x * 3.6 + t * 0.93, y * 3.6 - t * 0.47, z * 3.6 + t * 0.39);

    return broad * 0.58 + medium * 0.3 + fine * 0.12;
  },

  flutter(config, position, time) {
    if (config.windFlutter <= 0 || config.windTurbulence <= 0) {
      return 0;
    }

    const scale = Math.max(40, config.windScale);
    const xRatio = position.x / scale;
    const phase = time * config.windSpeed * 5.2;
    const traveling = Math.sin(xRatio * Math.PI * 3.4 - phase);
    const crossWave = Math.sin((position.y + position.z) / scale * Math.PI * 1.2 + phase * 0.73);

    return (traveling * 0.72 + crossWave * 0.28) * config.windFlutter * config.windTurbulence * 0.35;
  },

  valueNoise3(x, y, z) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const fx = this.smoothStep(x - x0);
    const fy = this.smoothStep(y - y0);
    const fz = this.smoothStep(z - z0);
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const z1 = z0 + 1;
    const n000 = this.hashNoise(x0, y0, z0);
    const n100 = this.hashNoise(x1, y0, z0);
    const n010 = this.hashNoise(x0, y1, z0);
    const n110 = this.hashNoise(x1, y1, z0);
    const n001 = this.hashNoise(x0, y0, z1);
    const n101 = this.hashNoise(x1, y0, z1);
    const n011 = this.hashNoise(x0, y1, z1);
    const n111 = this.hashNoise(x1, y1, z1);
    const nx00 = this.mix(n000, n100, fx);
    const nx10 = this.mix(n010, n110, fx);
    const nx01 = this.mix(n001, n101, fx);
    const nx11 = this.mix(n011, n111, fx);
    const nxy0 = this.mix(nx00, nx10, fy);
    const nxy1 = this.mix(nx01, nx11, fy);

    return this.mix(nxy0, nxy1, fz);
  },

  hashNoise(x, y, z) {
    const value = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
    return (value - Math.floor(value)) * 2 - 1;
  },

  smoothStep(value) {
    return value * value * value * (value * (value * 6 - 15) + 10);
  },

  mix(a, b, amount) {
    return a + (b - a) * amount;
  },
};
