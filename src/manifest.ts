// Chrome Manifest V3 definition with a pinned RSA public key so unpacked
// installs always receive the deterministic extension ID registered by ArcMD's
// one-click Native Messaging Host installer (`njbinggncmencnnnhcccpamjiolhglen`).

export const PINNED_MANIFEST_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxlJ7uMk4YGKc7E77LXaNAqIz2YPPpqV+PLdCCa21+FZIPyhS+yo3BZJ/9NNNANkoVoMecHiknPslFS6hMt12pE+kiKjn3AXhmAqYtnB/4VtLYY7aE7Z537O+nrbE5ls/GKqNWi/YKqj1MOzdIiV3BjdmnKPFp08QQ4gpnr7sOILA2tJ3Hwv+uKgAhw0qawWpW5ofgzwQntwYVeeTxje8ttCJsT46lQ1QoJU9Vbs51YLt3eWXNhZvv2jufuIXesN1cyqv8t6fmowmhBQSkxVYSSnNrBnSU3RzVaLhrTb1Aaz2j38YAfuHeUO77VaRERpN240K/EegkY/VkqtFtrkNewIDAQAB';

export const NATIVE_HOST_NAME = 'com.cizai.arcmd.clipper';

export function buildManifest(version: string) {
  return {
    manifest_version: 3,
    name: 'ArcMD Web Clipper',
    short_name: 'ArcMD Clipper',
    version,
    description:
      'Clip web pages, highlights, and localized images directly into your local ArcMD spaces and databases as clean Markdown.',
    key: PINNED_MANIFEST_KEY,
    icons: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png',
    },
    action: {
      default_title: 'ArcMD Web Clipper',
      default_popup: 'popup/index.html',
      default_icon: {
        '16': 'icons/icon-16.png',
        '32': 'icons/icon-32.png',
      },
    },
    options_ui: {
      page: 'options/index.html',
      open_in_tab: true,
    },
    background: {
      service_worker: 'background.js',
      type: 'module',
    },
    content_scripts: [
      {
        matches: ['http://*/*', 'https://*/*'],
        js: ['content.js'],
        run_at: 'document_idle',
      },
    ],
    permissions: ['activeTab', 'scripting', 'storage', 'contextMenus', 'nativeMessaging'],
    host_permissions: ['http://*/*', 'https://*/*'],
    commands: {
      _execute_action: {
        suggested_key: {
          default: 'Alt+Shift+C',
          mac: 'Alt+Shift+C',
        },
        description: 'Open ArcMD Web Clipper',
      },
      'toggle-highlighter': {
        suggested_key: {
          default: 'Alt+Shift+H',
          mac: 'Alt+Shift+H',
        },
        description: 'Toggle ArcMD webpage highlight mode',
      },
    },
  };
}
