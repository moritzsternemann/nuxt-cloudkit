const path = require('path');

module.exports = function nuxtCloudKit(moduleOptions) {
  let options = Object.assign({
    containerIdentifier: process.env.CLOUDKIT_CONTAINER_IDENTIFIER,
    apiToken: process.env.CLOUDKIT_API_TOKEN,
    environment: process.env.CLOUDKIT_ENVIRONMENT
  }, moduleOptions);

  if (!options.containerIdentifier) {
    throw new Error('CloudKit: containerIdentifier missing!');
  }
  if (!options.apiToken) {
    throw new Error('CloudKit: apiToken missing!');
  }
  if (!options.environment) {
    throw new Error('CloudKit: environment missing!');
  }

  this.options.head.script.push({
    src: 'https://cdn.apple-cloudkit.com/ck/2/cloudkit.js',
    async: true
  });

  // add CloudKit plugin
  this.addPlugin({
    src: path.resolve(__dirname, 'nuxt-cloudkit-plugin.js'),
    options
  });
};
