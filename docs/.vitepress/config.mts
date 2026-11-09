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
      { text: 'Plugins', link: '/plugins/' },
      { text: 'Getting started', link: '/getting-started/' },
      { text: 'Changelogs', link: '/changelogs/' },
      { text: 'Shortcuts', link: '/keyboard-shortcuts' },
    ],
    sidebar: [
      {
        text: 'Getting started',
        items: [
          { text: 'Welcome', link: '/getting-started/' },
          { text: 'Installation', link: '/getting-started/installation' },
          { text: 'Compatibility', link: '/getting-started/compatibility' },
          { text: 'Getting a license', link: '/getting-started/licensing' },
        ],
      },
      {
        text: 'Plugins',
        link: '/plugins/',
        items: [
          {
            text: 'LumenAuction',
            collapsed: true,
            items: [
              { text: 'Overview', link: '/products/lumen-auction' },
              { text: 'Installation', link: '/products/lumen-auction#installation' },
              { text: 'Commands & permissions', link: '/products/lumen-auction#commands-and-permissions' },
              { text: 'Configuration', link: '/products/lumen-auction#configuration' },
              { text: 'What it does', link: '/products/lumen-auction#features' },
              { text: 'Troubleshooting', link: '/products/lumen-auction#troubleshooting' },
            ],
          },
          {
            text: 'Gladiator',
            collapsed: true,
            items: [
              { text: 'Overview', link: '/products/gladiator' },
              { text: 'Installation', link: '/products/gladiator#installation' },
              { text: 'Commands & permissions', link: '/products/gladiator#commands-and-permissions' },
              { text: 'Configuration', link: '/products/gladiator#configuration' },
              { text: 'What it does', link: '/products/gladiator#features' },
              { text: 'Troubleshooting', link: '/products/gladiator#troubleshooting' },
            ],
          },
          {
            text: 'LumenSpoofer',
            collapsed: true,
            items: [
              { text: 'Overview', link: '/products/lumen-spoofer' },
              { text: 'Installation', link: '/products/lumen-spoofer#installation' },
              { text: 'Commands', link: '/products/lumen-spoofer#commands' },
              { text: 'What it does', link: '/products/lumen-spoofer#what-it-does' },
              { text: 'Troubleshooting', link: '/products/lumen-spoofer#troubleshooting' },
            ],
          },
          {
            text: 'LumenDuels',
            collapsed: true,
            items: [
              { text: 'Overview', link: '/products/lumen-duels' },
              { text: 'Installation', link: '/products/lumen-duels#installation' },
              { text: 'Commands & permissions', link: '/products/lumen-duels#commands-and-permissions' },
              { text: 'Configuration', link: '/products/lumen-duels#configuration' },
              { text: 'What it does', link: '/products/lumen-duels#features' },
              { text: 'Troubleshooting', link: '/products/lumen-duels#troubleshooting' },
            ],
          },
          {
            text: 'LumenDuels Premium',
            collapsed: true,
            items: [
              { text: 'Overview', link: '/products/lumen-duels-premium' },
              { text: 'Installation', link: '/products/lumen-duels-premium#installation' },
              { text: 'Commands', link: '/products/lumen-duels-premium#commands' },
              { text: 'Configuration', link: '/products/lumen-duels-premium#configuration' },
              { text: 'What it does', link: '/products/lumen-duels-premium#what-it-does' },
            ],
          },
          {
            text: 'LumenBounty',
            collapsed: true,
            items: [
              { text: 'Overview', link: '/products/lumen-bounty' },
              { text: 'BuiltByBit', link: 'https://builtbybit.com/resources/lumenbounty.132973/' },
            ],
          },
          {
            text: 'LumenEconomy',
            collapsed: true,
            items: [
              { text: 'Overview', link: '/products/lumen-economy' },
              { text: 'Installation', link: '/products/lumen-economy#installation' },
              { text: 'Commands & permissions', link: '/products/lumen-economy#commands-and-permissions' },
              { text: 'Configuration', link: '/products/lumen-economy#configuration' },
              { text: 'What it does', link: '/products/lumen-economy#features' },
              { text: 'Troubleshooting', link: '/products/lumen-economy#troubleshooting' },
            ],
          },
          {
            text: 'LumenEssentials',
            collapsed: true,
            items: [
              { text: 'Overview', link: '/products/lumen-essentials' },
              { text: 'Installation', link: '/products/lumen-essentials#installation' },
              { text: 'Commands & permissions', link: '/products/lumen-essentials#commands-and-permissions' },
              { text: 'Configuration', link: '/products/lumen-essentials#configuration' },
              { text: 'What it does', link: '/products/lumen-essentials#features' },
              { text: 'Troubleshooting', link: '/products/lumen-essentials#troubleshooting' },
            ],
          },
          {
            text: 'LumenOrder',
            collapsed: true,
            items: [
              { text: 'Overview', link: '/products/lumen-order' },
              { text: 'Installation', link: '/products/lumen-order#installation' },
              { text: 'Commands & permissions', link: '/products/lumen-order#commands-and-permissions' },
              { text: 'Configuration', link: '/products/lumen-order#configuration' },
              { text: 'What it does', link: '/products/lumen-order#features' },
              { text: 'Troubleshooting', link: '/products/lumen-order#troubleshooting' },
            ],
          },
          {
            text: 'LumenShards',
            collapsed: true,
            items: [
              { text: 'Overview', link: '/products/lumen-shards' },
              { text: 'Installation', link: '/products/lumen-shards#installation' },
              { text: 'Commands & permissions', link: '/products/lumen-shards#commands-and-permissions' },
              { text: 'Configuration', link: '/products/lumen-shards#configuration' },
              { text: 'What it does', link: '/products/lumen-shards#features' },
              { text: 'Troubleshooting', link: '/products/lumen-shards#troubleshooting' },
            ],
          },
          {
            text: 'LumenSpawners',
            collapsed: true,
            items: [
              { text: 'Overview', link: '/products/lumen-spawners' },
              { text: 'Installation', link: '/products/lumen-spawners#installation' },
              { text: 'Commands & permissions', link: '/products/lumen-spawners#commands-and-permissions' },
              { text: 'Configuration', link: '/products/lumen-spawners#configuration' },
              { text: 'What it does', link: '/products/lumen-spawners#features' },
              { text: 'Troubleshooting', link: '/products/lumen-spawners#troubleshooting' },
            ],
          },
          {
            text: 'Coming soon',
            collapsed: true,
            items: [
              { text: 'LumenTeam', link: '/coming-soon?product=LumenTeam' },
              { text: 'LumenIntellegance', link: '/coming-soon?product=LumenIntellegance' },
              { text: 'Sentinel', link: '/coming-soon?product=Sentinel' },
            ],
          },
        ],
      },
      { text: 'Troubleshooting', link: '/troubleshooting' },
      {
        text: 'Reference',
        items: [
          { text: 'Changelogs', link: '/changelogs/' },
          { text: 'Recent product updates', link: '/changelogs/updates' },
          { text: 'Keyboard shortcuts', link: '/keyboard-shortcuts' },
        ],
      },
    ],
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
