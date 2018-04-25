const Vue = require('vue').default;

class CloudKitInterface {
    constructor(config) {
      this.eventHandlers = {};
      this.config = config;
      this.ck = undefined;
      this.defaultContainer = undefined;
      this.publicDatabase = undefined;
      this.user = undefined;

      // wait for initialization
      window.addEventListener('cloudkitloaded', this.onCloudKitLoaded.bind(this));
    }

    on(key, handler) {
      this.eventHandlers[key] = handler;
    }

    emit(key, parameters) {
      this.eventHandlers[key](parameters);
    }

    onCloudKitLoaded() {
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
            this.emit('setupAuthError', error);
          })
      });
    }

    gotoAuthenticatedState(userIdentity) {
      this.user = userIdentity;
      this.emit('authenticated', userIdentity);

      this.defaultContainer
        .whenUserSignsOut()
        .then(this.gotoUnauthenticatedState.bind(this));
    }

    gotoUnauthenticatedState(error) {
      if (error) {
        throw error;
      }

      this.user = undefined;
      this.emit('unauthenticated');

      this.defaultContainer
        .whenUserSignsIn()
        .then(this.gotoAuthenticatedState.bind(this))
        .catch(this.gotoUnauthenticatedState.bind(this));
    }

    async save(recordType, recordName, recordChangeTag, fields) {
      const response = await this.saveRecord(
        'PUBLIC',
        recordType,
        recordName,
        recordChangeTag,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        fields,
        null
      );
      if (!response.records[0]) {
        throw new Error('Empty response saving record: ' + recordName);
      }
      return response.records[0];
    }

    async saveRecord(databaseScope, recordType, recordName, recordChangeTag, zoneName, forRecordName, forRecordChangeTag, publicPermission, ownerRecordName, participants, parentRecordName, fields, createShortGUID) {
      const options = {};

      // if no zone name is provided, the record will be saved to the default zone.
      if (zoneName) {
        options.zoneID = { zoneName };
        if (ownerRecordName) {
          options.zoneID.ownerRecordName = ownerRecordName;
        }
      }

      const record = {
        recordType
      };

      // if no recordName is provided the server will generate one.
      if (recordName) {
        record.recordName = recordName;
      }

      // to modify an existing record, supply a recordChangeTag
      if (recordChangeTag) {
        record.recordChangeTag = recordChangeTag;
      }

      // convert the fields to the appropriate format
      record.fields = Object.keys(fields).reduce((obj, key) => {
        obj[key] = { value: fields[key] };
        return obj;
      }, {});

      // if we are going to want to share the record we need to request a stable short GUID.
      if (createShortGUID) {
        record.createShortGUID = true;
      }

      // if we want to share the record via a parent reference we need to set the records's parent property.
      if (parentRecordName) {
        record.parent = { recordName: parentRecordName };
      }

      if (publicPermission) {
        record.publicPermission = this.ck.ShareParticipantPermission[publicPermission];
      }

      // if we are creating a share record, we must specify the record which we are sharing.
      if (forRecordName && forRecordChangeTag) {
        record.forRecord = {
          recordName: forRecordName,
          recordChangeTag: forRecordChangeTag
        };
      }

      if (participants) {
        record.participants = participants.map(participant => ({
          userIdentity: {
            lookupInfo: { emailAddress: participant.emailAddress }
          },
          permssion: this.ck.ShareParticipantPermission[participant.permission],
          type: participant.type,
          acceptanceStatus: participant.acceptanceStatus
        }));
      }

      return this.promisify(
        this.publicDatabase.saveRecords(record, options)
      );
    }

    fetchCurrentUserIdentity() {
      return this.defaultContainer.fetchCurrentUserIdentity();
    }

    async fetchRecord(recordName) {
      const { records } = await this.promisify(
        this.publicDatabase.fetchRecords(recordName)
      );
      if (!records[0]) {
        throw new Error('Empty response fetchin record: ' + recordName);
      }
      return records[0];
    }

    query(recordType, filterBy, options) {
      return this.performQuery({
        recordType,
        filterBy
      }, options);
    }

    performQuery(query, options) {
      return this.promisify(
        this.publicDatabase.performQuery(query, options)
      );
    }

    promisify(ckPromise) {
      return new Promise((resolve, reject) => {
        ckPromise.then(response => {
          if (response.hasErrors) {
            return reject(response.errors);
          }
          resolve(response);
        })
      });
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
