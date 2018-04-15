const Vue = require('vue').default;
const EventEmitter = require('event-emitter-es6');

class CloudKitInterface extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.ck = undefined;
    this.defaultContainer = undefined;
    this.publicDatabase = undefined;
    this.user = undefined;

    // wait for initialization
    window.addEventListener('cloudkitloaded', this.onCloudKitLoaded.bind(this));
  }

  onCloudKitLoaded() {
    console.log('onCloudKitLoaded');
    if (!window['CloudKit']) {
      throw new Error('CloudKit was not loaded properly!');
    }

    this.ck = window['CloudKit'];

    this.ck.configure({
      containers: [{
        containerIdentifier: this.config.containerIdentifier,
        apiTokenAuth: {
          apiToken: this.config.apiToken,
          persist: true
        },
        environment: this.config.environment
      }]
    });

    // get default container and defualt public database
    this.defaultContainer = this.ck.getDefaultContainer();
    this.publicDatabase = this.defaultContainer.getDatabaseWithDatabaseScope(
      this.ck.DatabaseScope['PUBLIC']
    );

    this.setupAuth()
  }

  setupAuth() {
    return new Promise(resolve => {
      this.defaultContainer.setUpAuth()
        .then(userIdentity => {
          if (userIdentity) {
            this.gotoAuthenticatedState(userIdentity);
          } else {
            this.gotoUnauthenticatedState();
          }
          resolve();
        })
        .catch(error => {
          console.log('setupAuth error', error);
        })
    });
  }

  gotoAuthenticatedState(userIdentity) {
    console.log('gotoAuthenticatedState');
    this.user = userIdentity;
    this.user.isAuthenticated = true;
    this.emit('CloudKit.authenticated');

    this.defaultContainer
      .whenUserSignsOut()
      .then(this.gotoUnauthenticatedState.bind(this));
  }

  gotoUnauthenticatedState(error) {
    console.log('gotoUnauthenticatedState');
    if (error) {
      throw error;
    }

    this.user = undefined;
    this.emit('CloudKit.unauthenticated');

    this.defaultContainer
      .whenUserSignsIn()
      .then(this.gotoAuthenticatedState.bind(this))
      .catch(this.gotoUnauthenticatedState.bind(this));
  }
}

const cloudKitPlugin = {
  install() {
    if (Vue['__nuxt_cloudKit_installed__']) {
      return;
    }
    Vue['__nuxt_cloudKit_installed__'] = true;

    if (!Vue.prototype.$cloudKit) {
      Vue.prototype.$cloudKit = new CloudKitInterface({
        containerIdentifier: '<%= options.containerIdentifier %>',
        apiToken: '<%= options.apiToken %>',
        environment: '<%= options.environment %>',
      });
    }
  }
};

Vue.use(cloudKitPlugin);

export default (ctx) => {
  const { app } = ctx;
  app.$cloudKit = Vue.prototype.$cloudKit;
  ctx.$cloudKit = Vue.prototype.$cloudKit;
};
