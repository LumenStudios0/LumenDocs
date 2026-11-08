import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'en-US',
  title: 'Lumen Studios',
  description: 'Official documentation for Lumen Studios Minecraft plugins.',
  base: '/LumenDocs/',
  cleanUrls: true,
  appearance: 'dark',
  lastUpdated: true,
  head: [
    ['meta', { name: 'theme-color', content: '#0d0a14' }],
    ['link', { rel: 'icon', type: 'image/png', href: '/LumenDocs/assets/lumen-logo.png' }],
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
      { text: 'Home', link: '/' },
      { text: 'Plugins', link: '/plugins/' },
      { text: 'Getting started', link: '/getting-started/' },
      { text: 'Licensing', link: '/getting-started/licensing' },
      { text: 'Discord', link: 'https://discord.gg/lumenstudios' },
      { text: 'Troubleshooting', link: '/troubleshooting' },
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
        ],
      },
      { text: 'Troubleshooting', link: '/troubleshooting' },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/LumenStudios0' },
    ],
    editLink: {
      pattern: 'https://github.com/LumenStudios0/LumenDocs/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
    footer: {
      message: 'Here to help you get your server running.',
      copyright: 'Copyright © Lumen Studios',
    },
  },
})
