
const { classes: Cc, interfaces: Ci, utils: Cu } = Components;


this.tabsplit_child = class API extends ExtensionAPI {
  getAPI(context) {
    return {
      tabsplit_child: {
        init_child: async () => {
          const doc = context.contentWindow.document;
          const frame = doc.getElementById('browser-iframe');
          // frame.contentWindow.top = frame.contentWindow.self;
          return "init";
        }
      }
    }
  }
}

