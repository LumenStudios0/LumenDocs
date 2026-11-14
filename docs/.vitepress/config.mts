import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'en-US',
  title: 'Lumen Studios',
  description: 'Official documentation for Lumen Studios Minecraft plugins.',
  base: '/',
  cleanUrls: true,
  appearance: 'dark',
  lastUpdated: true,
  markdown: {
    codeCopyButtonTitle: 'Copy to clipboard',
  },
  head: [
    ['meta', { name: 'theme-color', content: '#0d0a14' }],
    ['link', { rel: 'icon', type: 'image/png', href: '/assets/lumen-logo.png' }],
  ],
  themeConfig: {
    logo: '/assets/lumen-logo.png',
    siteTitle: 'Lumen Studios',
    outline: { level: [2, 3] },
    lastUpdated: { text: 'Updated' },
    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: {
                buttonText: 'Search docs',
                buttonAriaLabel: 'Search documentation',
              },
              modal: {
                noResultsText: 'No results found',
                resetButtonTitle: 'Clear search',
                footer: {
                  selectText: 'to select',
                  navigateText: 'to navigate',
                  closeText: 'to close',
                },
              },
            },
          },
        },
      },
    },
    nav: [
      { text: 'Documentation', link: '/docs/' },
      { text: 'Plugins', link: '/plugins/' },
      { text: 'Customer portal', link: '/account/' },
      { text: 'Support', link: '/reports/' },
    ],
    sidebar: {
      '/admin/': [
        {
          text: 'Studio tools',
          items: [
            { text: 'Staff Dashboard', link: '/admin/' },
            { text: 'Customer portal', link: '/account/' },
          ],
        },
      ],
      '/account/': [
        {
          text: 'Your account',
          items: [
            { text: 'Dashboard', link: '/account/' },
            { text: 'My licenses', link: '/account/licenses' },
            { text: 'Products purchased', link: '/account/products' },
            { text: 'Account settings', link: '/account/settings' },
            { text: 'My tickets', link: '/account/tickets' },
            { text: 'Notifications & preferences', link: '/account/notifications' },
          ],
        },
        {
          text: 'Need help?',
          items: [
            { text: 'Browse plugins', link: '/plugins/' },
            { text: 'Documentation', link: '/docs/' },
            { text: 'Contact support', link: '/reports/' },
          ],
        },
      ],
      '/docs/': [
        {
          text: 'Documentation',
          items: [
            { text: 'Docs home', link: '/docs/' },
            { text: 'Getting started', link: '/getting-started/' },
            { text: 'Plugin catalog', link: '/plugins/' },
            { text: 'Troubleshooting', link: '/troubleshooting' },
            { text: 'Searchable error guides', link: '/error-guides' },
            { text: 'My bookmarks', link: '/bookmarks' },
          ],
        },
        {
          text: 'Popular guides',
          items: [
            { text: 'Installation', link: '/getting-started/installation' },
            { text: 'Compatibility', link: '/getting-started/compatibility' },
            { text: 'Licensing', link: '/getting-started/licensing' },
          ],
        },
        {
          text: 'More',
          items: [
            { text: 'Release notes', link: '/changelogs/' },
            { text: 'Support & requests', link: '/reports/' },
            { text: 'Known issues', link: '/known-issues' },
            { text: 'Service status', link: '/status' },
          ],
        },
      ],
      '/getting-started/': [
        {
          text: 'Getting started',
          items: [
            { text: 'Overview', link: '/getting-started/' },
            { text: 'Installation', link: '/getting-started/installation' },
            { text: 'Compatibility', link: '/getting-started/compatibility' },
            { text: 'Licensing', link: '/getting-started/licensing' },
          ],
        },
        {
          text: 'Explore',
          items: [
            { text: 'Plugin catalog', link: '/plugins/' },
            { text: 'Troubleshooting', link: '/troubleshooting' },
            { text: 'Contact support', link: '/reports/' },
          ],
        },
      ],
      '/plugins/': [
        {
          text: 'Product library',
          items: [
            { text: 'Browse all plugins', link: '/plugins/' },
            { text: 'Getting started', link: '/getting-started/' },
            { text: 'Compatibility', link: '/getting-started/compatibility' },
          ],
        },
        {
          text: 'Popular guides',
          items: [
            { text: 'Installation', link: '/getting-started/installation' },
            { text: 'Licensing', link: '/getting-started/licensing' },
            { text: 'Troubleshooting', link: '/troubleshooting' },
          ],
        },
      ],
      '/products/': [
        {
          text: 'Product guides',
          items: [
            { text: 'Gladiator', link: '/products/gladiator' },
            { text: 'LumenAuction', link: '/products/lumen-auction' },
            { text: 'LumenBounty', link: '/products/lumen-bounty' },
            { text: 'LumenDuels', link: '/products/lumen-duels' },
            { text: 'LumenDuels Premium', link: '/products/lumen-duels-premium' },
            { text: 'LumenEconomy', link: '/products/lumen-economy' },
            { text: 'LumenEssentials', link: '/products/lumen-essentials' },
            { text: 'LumenOrder', link: '/products/lumen-order' },
            { text: 'LumenShards', link: '/products/lumen-shards' },
            { text: 'LumenSpoofer', link: '/products/lumen-spoofer' },
            { text: 'LumenSpawners', link: '/products/lumen-spawners' },
          ],
        },
        {
          text: 'Help',
          items: [
            { text: 'Plugin catalog', link: '/plugins/' },
            { text: 'Troubleshooting', link: '/troubleshooting' },
          ],
        },
      ],
      '/changelogs/': [
        {
          text: 'Release notes',
          items: [
            { text: 'All updates', link: '/changelogs/' },
            { text: 'Recent product updates', link: '/changelogs/updates' },
          ],
        },
        {
          text: 'Explore',
          items: [
            { text: 'Plugin catalog', link: '/plugins/' },
            { text: 'Documentation', link: '/docs/' },
          ],
        },
      ],
      '/reports/': [
        {
          text: 'Support center',
          items: [
            { text: 'Send a report', link: '/reports/' },
            { text: 'Troubleshooting', link: '/troubleshooting' },
            { text: 'Compatibility guide', link: '/getting-started/compatibility' },
          ],
        },
        {
          text: 'Documentation',
          items: [
            { text: 'Getting started', link: '/getting-started/' },
            { text: 'Plugin catalog', link: '/plugins/' },
          ],
        },
      ],
      '/': [
        {
          text: 'Documentation',
          items: [
            { text: 'Docs home', link: '/docs/' },
            { text: 'Getting started', link: '/getting-started/' },
            { text: 'Plugin catalog', link: '/plugins/' },
          ],
        },
        {
          text: 'Reference',
          items: [
            { text: 'Troubleshooting', link: '/troubleshooting' },
            { text: 'Release notes', link: '/changelogs/' },
            { text: 'Keyboard shortcuts', link: '/keyboard-shortcuts' },
          ],
        },
      ],
    },
    socialLinks: [
      {
        ariaLabel: 'Log in with Discord',
        icon: {
          svg: '<svg viewBox="0 0 127.14 96.36" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.08 0A72.37 72.37 0 0 0 45.67 0a105.89 105.89 0 0 0-26.25 8.09C2.8 32.65-1.69 56.6.56 80.21A105.73 105.73 0 0 0 32.71 96.3a77.7 77.7 0 0 0 6.9-11.14 68.42 68.42 0 0 1-10.86-5.18c.91-.66 1.8-1.34 2.66-2.03a75.76 75.76 0 0 0 64.32 0c.87.74 1.76 1.42 2.66 2.03a68.68 68.68 0 0 1-10.88 5.19 77.1 77.1 0 0 0 6.9 11.13 105.28 105.28 0 0 0 32.17-16.1c2.64-27.38-4.52-51.11-18.88-72.13ZM42.45 65.65c-6.27 0-11.43-5.73-11.43-12.77s5.03-12.82 11.43-12.82 11.55 5.73 11.44 12.82c-.01 7.04-5.04 12.77-11.44 12.77Zm42.24 0c-6.27 0-11.43-5.73-11.43-12.77s5.03-12.82 11.43-12.82 11.55 5.73 11.43 12.82c0 7.04-5.03 12.77-11.43 12.77Z"/></svg>',
        },
        link: 'https://discord.gg/lumenstudios',
      },
    ],
    footer: {
      message: 'Here to help you get your server running.',
      copyright: 'Copyright © Lumen Studios',
    },
  },
})
