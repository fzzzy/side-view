
const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

function lognames(obj) {
  let names = '';
  for (let n in obj) {
    names += n + ' ';
  }
  console.log(names);
}

this.tabsplit_child = class API extends ExtensionAPI {
  getAPI(context) {
    return {
      tabsplit_child: {
        init_child: async () => {
          const doc = context.contentWindow.document;
          const frame = doc.getElementById('browser-iframe');
          const self = frame.contentWindow.self;
          Object.defineProperty(frame.contentWindow, 'top', {
            get: () => { console.log('GET'); return self; }
          });
          // frame.contentWindow.top = frame.contentWindow.self;
          console.log(
            'equal',
            frame.contentWindow.top === frame.contentWindow.self);
          //lognames(frame.contentWindow.top);
          //console.log(
          //  frame.contentWindow.top.document.body.outerHTML);//,
          //  frame.contentWindow.self.document.body.outerHTML);
          return "init";
        }
      }
    }
  }
}

