/* ============================================================================
 * Valheim / Nitrado settings schema
 * ----------------------------------------------------------------------------
 * Verified against a real Nitrado Valheim service (Sept 2026). The keys below
 * are exactly what Nitrado returns and accepts.
 *
 * Two things worth knowing before editing:
 *
 *   - Nitrado stores the world modifier dials with the value "default" when the
 *     preset is in charge, NOT "normal". The option values here must match
 *     Nitrado's casing exactly, because they are sent back verbatim.
 *   - Every setting here lives in the single `general` category. Additional
 *     categories are rendered automatically if Nitrado ever adds them.
 *
 * Keys are matched by a normalised alias (case and punctuation ignored), so an
 * entry covers ServerName, server_name and "Server Name" alike. Anything
 * Nitrado returns that is not listed still renders with a tidy generated name.
 * Nitrado's own option lists always win over this file.
 * ==========================================================================*/

window.SETTINGS_SCHEMA = {
  /* --------------------------------------------------------- server identity */

  server_name: {
    aliases: ['ServerName', 'servername', 'name', 'hostname', 'label'],
    label: 'Server name',
    help: 'The name shown in the Steam server browser and on the loading screen. Purely cosmetic — changing it does not touch your world.',
    type: 'text',
    placeholder: 'My Valheim Server',
  },

  server_password: {
    aliases: ['Password', 'serverpassword', 'password', 'joinpassword'],
    label: 'Password',
    help: 'Players must type this to join. Valheim requires at least 5 characters. A public server must have one — leave it empty only if Public is off.',
    type: 'password',
  },

  world_name: {
    aliases: ['WorldName', 'worldname', 'world', 'savefile', 'worldfile'],
    label: 'World name',
    help: 'Which world the server loads. This must match a folder in savedata/worlds_local exactly, including capitals — if it does not, Valheim silently generates a brand new world under that name instead of failing.',
    type: 'text',
    suggestions: ['Dedicated'],
  },

  server_public: {
    aliases: ['Public', 'serverpublic', 'public', 'ispublic'],
    label: 'Public',
    help: 'Lists the server in the public Steam server browser. Requires a password. When off, players can only join with the address below.',
    type: 'boolean',
  },

  crossplay: {
    aliases: ['Crossplay', 'crossplay', 'allowcrossplay'],
    label: 'Crossplay',
    help: 'Lets console and Microsoft Store players join. Switches the backend to PlayFab — the join code changes, and a crossplay server cannot be reached via a LAN or loopback address.',
    type: 'boolean',
  },

  /* --------------------------------------------------------- world preset */

  world_preset: {
    aliases: ['Preset', 'preset', 'worldpreset', 'difficulty'],
    label: 'World preset',
    help: 'A bundle of every difficulty dial at once. It overwrites the individual modifiers below, so set the preset first and only override what you want different.',
    type: 'enum',
    options: [
      { value: 'Normal', label: 'Normal', help: 'The game as shipped — every dial at its default.' },
      { value: 'Casual', label: 'Casual', help: 'Softer combat, relaxed death penalty, more resources, no raids, open portals.' },
      { value: 'Easy', label: 'Easy', help: 'Gently easier combat and death penalty; everything else near normal.' },
      { value: 'Hard', label: 'Hard', help: 'Tougher combat, harsher death penalty, tighter portal rules.' },
      { value: 'Hardcore', label: 'Hardcore', help: 'Hard, with brutal death rules: carried gear is destroyed and skills wiped.' },
      { value: 'Immersive', label: 'Immersive', help: 'Built for exploration: no map, fire spreads everywhere, limited portals, hard combat.' },
      { value: 'Hammer', label: 'Hammer (builder)', help: 'Free building, easy combat, boosted resources, open portals. Counts as a cheat and blocks some achievements.' },
    ],
  },

  /* ------------------------------------------------------- world modifier dials
   * "default" means "let the preset decide" — it is not the same as normal. */

  combat: {
    aliases: ['CombatModifier', 'combat', 'combatmode', 'combatdifficulty'],
    label: 'Combat difficulty',
    help: 'Scales four things at once: damage you deal, damage enemies deal, how fast and large enemies are, and how often they spawn with stars.',
    type: 'enum',
    options: [
      { value: 'default', label: 'Use preset', help: 'No override — whatever the world preset sets.' },
      { value: 'veryeasy', label: 'Very easy', help: 'You deal 125% damage; enemies deal 50%.' },
      { value: 'easy', label: 'Easy', help: 'You deal 110% damage; enemies deal 75%.' },
      { value: 'hard', label: 'Hard', help: 'You deal 85%; enemies deal 150% and are bigger, faster and more often starred.' },
      { value: 'veryhard', label: 'Very hard', help: 'You deal 70%; enemies deal 200% and spawn the nastiest variants.' },
    ],
  },

  death_penalty: {
    aliases: ['DeathPenaltyModifier', 'deathpenalty', 'deathpenaltymode'],
    label: 'Death penalty',
    help: 'What happens to your gear, inventory and skills when you die. The setting players notice most — on a mixed-skill server, casual saves a lot of evenings.',
    type: 'enum',
    options: [
      { value: 'default', label: 'Use preset', help: 'No override — whatever the world preset sets.' },
      { value: 'casual', label: 'Casual', help: 'Equipped gear is kept, the rest of the inventory drops, skills barely suffer.' },
      { value: 'veryeasy', label: 'Very easy', help: 'Everything drops, but you lose almost no skill.' },
      { value: 'easy', label: 'Easy', help: 'Everything drops and you lose less skill than normal.' },
      { value: 'hard', label: 'Hard', help: 'Unequipped items are destroyed outright, and you lose more skill.' },
      { value: 'hardcore', label: 'Hardcore', help: 'Everything carried is destroyed and all skills are wiped. Permanent.' },
    ],
  },

  resources: {
    aliases: ['ResourcesModifier', 'resources', 'resourcedrops', 'lootmultiplier'],
    label: 'Resource drops',
    help: 'A multiplier on what creatures and lootable objects give. Does not affect fish, trophies or boss drops, and changes how much you gather — not how fast you swing.',
    type: 'enum',
    options: [
      { value: 'default', label: 'Use preset', help: 'No override — whatever the world preset sets.' },
      { value: 'muchless', label: 'Much less', help: 'Half the normal drops (0.5x).' },
      { value: 'less', label: 'Less', help: 'About three quarters of normal (0.75x).' },
      { value: 'more', label: 'More', help: 'One and a half times normal (1.5x).' },
      { value: 'muchmore', label: 'Much more', help: 'Double normal (2x).' },
      { value: 'most', label: 'Most', help: 'Triple normal (3x).' },
    ],
  },

  raids: {
    aliases: ['RaidsModifier', 'raids', 'raidmode', 'raidevents'],
    label: 'Raids',
    help: 'How often base raid events such as "the forest is moving" can trigger. Note that night-time mob attacks still happen even with raids off.',
    type: 'enum',
    options: [
      { value: 'default', label: 'Use preset', help: 'No override — whatever the world preset sets.' },
      { value: 'none', label: 'None', help: 'Base raid events are switched off. Night-time monsters still appear.' },
      { value: 'muchless', label: 'Much less', help: 'Roughly a 92 minute gap and a 10% chance each roll.' },
      { value: 'less', label: 'Less', help: 'Roughly a 69 minute gap and a 13% chance each roll.' },
      { value: 'more', label: 'More', help: 'Roughly a 28 minute gap and a 33% chance each roll.' },
      { value: 'muchmore', label: 'Much more', help: 'Roughly a 14 minute gap and a 67% chance each roll.' },
    ],
  },

  portals: {
    aliases: ['PortalsModifier', 'portals', 'portalmode', 'portalrules'],
    label: 'Portals',
    help: 'What you are allowed to carry through a portal. Casual lets everything through, including ore and metal bars.',
    type: 'enum',
    options: [
      { value: 'default', label: 'Use preset', help: 'No override — whatever the world preset sets.' },
      { value: 'casual', label: 'Casual', help: 'Anything can go through a portal, including ore and metal bars.' },
      { value: 'hard', label: 'Hard', help: 'Stricter portal rules apply.' },
      { value: 'veryhard', label: 'Very hard', help: 'The harshest rules. Use "No portals" if you want them gone for certain.' },
    ],
  },

  /* ------------------------------------------------------------ world rules */

  free_building: {
    aliases: ['nobuildcost', 'freebuild', 'freebuilding', 'buildcost'],
    label: 'Free building',
    help: 'Building pieces cost no materials. You still have to unlock the recipes the normal way.',
    type: 'boolean',
  },

  free_crafting: {
    aliases: ['nocraftcost', 'freecraft', 'freecrafting', 'craftcost'],
    label: 'Free crafting',
    help: 'Crafting items costs no materials. Recipes still need to be unlocked unless you also turn on "All recipes unlocked".',
    type: 'boolean',
  },

  no_workbench: {
    aliases: ['noworkbench', 'workbench', 'noworkbenches'],
    label: 'No workbench required',
    help: 'Lets you build and repair without being near a workbench.',
    type: 'boolean',
  },

  all_pieces_unlocked: {
    aliases: ['allpiecesunlocked', 'allbuildingsunlocked', 'unlockallpieces'],
    label: 'All build pieces unlocked',
    help: 'Every building piece is available immediately, without discovering the recipes first.',
    type: 'boolean',
  },

  all_recipes_unlocked: {
    aliases: ['allrecipesunlocked', 'unlockallrecipes', 'allrecipes'],
    label: 'All recipes unlocked',
    help: 'Every crafting recipe is available from the start, including ones normally gated behind later biomes.',
    type: 'boolean',
  },

  dungeon_build: {
    aliases: ['dungeonbuild', 'buildindungeons', 'dungeonbuilding'],
    label: 'Build inside dungeons',
    help: 'Allows building and placing things inside dungeons, crypts and other instanced areas.',
    type: 'boolean',
  },

  no_boss_portals: {
    aliases: ['nobossportals', 'nobossportal', 'bossportalsdisabled'],
    label: 'No portals to bosses',
    help: 'Stops portals being built near boss locations, so you have to travel to a fight rather than teleport to it.',
    type: 'boolean',
  },

  teleport_all: {
    aliases: ['teleportall', 'teleporteverything', 'portalsallitems'],
    label: 'Teleport everything',
    help: 'Lets normally-blocked items such as ores and metal bars pass through portals. Equivalent to the "casual" portals modifier.',
    type: 'boolean',
  },

  no_map: {
    aliases: ['nomap', 'disablemap', 'nominimap'],
    label: 'No map',
    help: 'Removes the map and minimap for everyone. Part of the Immersive preset.',
    type: 'boolean',
  },

  no_portals: {
    aliases: ['noportals', 'disableportals', 'noportal'],
    label: 'No portals',
    help: 'Turns portals off completely. More reliable than the "very hard" portals modifier if you genuinely want them gone.',
    type: 'boolean',
  },

  passive_mobs: {
    aliases: ['passivemobs', 'passivecreatures', 'passiveenemies'],
    label: 'Passive creatures',
    help: 'Enemies will not attack until you hit them first. Only really suitable for a building or creative world.',
    type: 'boolean',
  },

  player_events: {
    aliases: ['playerevents', 'playertriggeredraids', 'perplayerevents'],
    label: 'Player-triggered raids',
    help: 'Raids follow each player\'s own progress rather than the world\'s. Turn this on when veterans and beginners share a server, so a new player in the Meadows does not get raids earned by someone else.',
    type: 'boolean',
  },

  fire_spread: {
    aliases: ['fire', 'firespread', 'firehazard'],
    label: 'Fire spreads outside Ashlands',
    help: 'Lets fire spread across every biome instead of only the Ashlands. Part of the Immersive preset.',
    type: 'boolean',
  },

  /* ----------------------------------------------- death behaviour (advanced)
   * These are the raw keys behind the Death penalty modifier. Use them only
   * when you want a combination the modifier values cannot express. */

  keep_equipment: {
    aliases: ['deathkeepequip', 'keepequipment', 'keepequip'],
    label: 'Keep equipped items on death',
    help: 'Your equipped gear stays on you when you die. Advanced — normally set via the Death penalty modifier.',
    type: 'boolean',
  },

  destroy_unequipped: {
    aliases: ['deathdeleteunequipped', 'deleteunequipped'],
    label: 'Destroy unequipped items on death',
    help: 'Anything you were not wearing or holding is destroyed rather than dropped. Advanced.',
    type: 'boolean',
  },

  destroy_all_items: {
    aliases: ['deathdeleteitems', 'deleteallitems', 'destroyitems'],
    label: 'Destroy all items on death',
    help: 'Everything you carried is destroyed, equipment included. Advanced — this is the hardcore behaviour.',
    type: 'boolean',
  },

  reset_skills: {
    aliases: ['deathskillsreset', 'resetskillsondeath', 'skillsreset'],
    label: 'Reset skills on death',
    help: 'Wipes your skill levels entirely when you die. Advanced — effectively hardcore.',
    type: 'boolean',
  },
};

/* Friendly names for the setting groups Nitrado returns. */
window.SETTINGS_CATEGORY_LABELS = {
  general: 'Server & world',
  config: 'Configuration',
  base: 'Basics',
  server: 'Server',
  network: 'Network',
  world: 'World & difficulty',
  gameplay: 'World & difficulty',
  modifiers: 'World modifiers',
  rules: 'World rules',
  backup: 'Backups',
  backups: 'Backups',
  advanced: 'Advanced',
  custom: 'Custom',
  expert: 'Expert settings',
};
