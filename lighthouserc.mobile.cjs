module.exports = {
  ci: {
    collect: {
      staticDistDir: './dist',
      numberOfRuns: 3,
      url: [
        'http://localhost/index.html',
        'http://localhost/ottoman/index.html',
        'http://localhost/ottoman/bridge.html',
        'http://localhost/ottoman/mosque.html',
        'http://localhost/ottoman/fountain.html',
        'http://localhost/ottoman/monastery.html',
      ],
      // Mobile is Lighthouse's default form factor, so no preset is set here.
      // (Valid --preset values are only perf/experimental/desktop.)
      settings: { formFactor: 'mobile' },
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.9 }],
        'categories:accessibility': ['warn', { minScore: 0.9 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.9 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: './.lighthouseci/mobile',
    },
  },
};
