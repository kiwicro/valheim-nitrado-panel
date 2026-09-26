/* ============================================================================
 * Valheim / Nitrado settings schema
 * ----------------------------------------------------------------------------
 * This is the friendly layer over the raw settings Nitrado returns. Each entry
 * is matched against a setting's key by a normalised alias, so it works whether
 * Nitrado calls it "server_name", "serverName", "Server Name" or "servername".
 *
 * Fields
 *   aliases   - every spelling this setting is known by (case/punctuation is
 *               ignored, so "save_interval" and "saveInterval" are the same)
 *   label     - the human name shown in the panel
 *   help      - the hover explanation
 *   type      - text | password | number | boolean | enum
 *   options   - for enum: { value, label, help } - help shows under the dropdown
 *   unit      - for number: shown after the input (seconds, %, ...)
 *   min/max/step - for number inputs
 *   placeholder / suggestions - for text inputs
 *
 * Anything Nitrado reports that isn't listed here still renders, just with a
 * tidy name generated from the key. Nitrado's own option lists always win over
 * this file, so a new setting type is handled even before it is added below.
 *
 * Edit this file freely — it is reloaded on every page refresh.
 * ==========================================================================*/

window.SETTINGS_SCHEMA = {
  /* -------------------------------------------------------------- identity */

  server_name: {
    aliases: ['servername', 'name', 'hostname', 'servertitle', 'serverlabel', 'label'],
    label: 'Server name',
    help: 'The name players see in the Steam server browser and on the loading screen. Purely cosmetic — it does not affect your world.',
    type: 'text',
    placeholder: 'My Valheim Server',
  },

  server_password: {
    aliases: ['serverpassword', 'password', 'gamepassword', 'joinpassword', 'serverpass'],
    label: 'Password',
    help: 'Players must type this to join. Valheim requires at least 5 characters. A public server must have one; leave it empty only for a private server.',
    type: 'password',
  },

  world_name: {
    aliases: ['worldname', 'world', 'savefile', 'worldfile', 'savegame', 'worldsave', 'savedir'],
    label: 'World name',
    help: 'Which world save the server loads. Changing it makes the server load or create a different world — your current world stays on disk, it just will not be the one running.',
    type: 'text',
    suggestions: ['Dedicated'],
  },

  instance_id: {
    aliases: ['instanceid', 'serverid', 'instance', 'servercode', 'joincode', 'playfabid'],
    label: 'Server ID (join code)',
    help: 'The instance ID used for direct joins. Changing it invalidates the old join code, so anyone who saved it will need the new one.',
    type: 'text',
  },

  server_public: {
    aliases: ['public', 'serverpublic', 'ispublic', 'publicserver', 'advertise', 'listed'],
    label: 'Public',
    help: 'Lists the server in the public Steam server browser so anyone can find and join it. Requires a password. Off means only people with the join code can get in.',
    type: 'boolean',
  },

  crossplay: {
    aliases: ['crossplay', 'allowcrossplay', 'crossplayenabled', 'enablecrossplay', 'playfab'],
    label: 'Crossplay',
    help: 'Lets console and Microsoft Store players join. Switches the server to the PlayFab backend — your join code changes and some mods stop working.',
    type: 'boolean',
  },

  /* --------------------------------------------------------------- network */

  game_port: {
    aliases: ['port', 'gameport', 'serverport', 'listenport', 'hostport'],
    label: 'Game port',
    help: 'The UDP port the game listens on. Valheim also uses the two ports directly above it, so changing this moves all three.',
    type: 'number',
    min: 1024,
    max: 65535,
    step: 1,
    placeholder: '2456',
  },

  query_port: {
    aliases: ['queryport', 'steamqueryport'],
    label: 'Query port',
    help: 'Used by the server browser to ask the server for its name and player count. Normally the game port plus one.',
    type: 'number',
    min: 1024,
    max: 65535,
    step: 1,
  },

  /* ------------------------------------------------------------ housekeeping */

  save_interval: {
    aliases: ['saveinterval', 'autosaveinterval', 'worldsaveinterval', 'savefrequency', 'savesec'],
    label: 'Save interval',
    help: 'How often the world is written to disk, in seconds. Shorter means less progress lost if the server dies, at the cost of brief periodic stutters. Valheim default is 1800 (30 minutes).',
    type: 'number',
    unit: 'seconds',
    min: 60,
    step: 30,
  },

  backup_interval: {
    aliases: ['backupinterval', 'autobackupinterval', 'backupevery', 'backupperiod'],
    label: 'Backup interval',
    help: 'How often Nitrado takes an automatic backup, in minutes. These are separate from the in-game world save.',
    type: 'number',
    unit: 'minutes',
    min: 0,
    step: 5,
  },

  backups_to_keep: {
    aliases: ['backupstokeep', 'backuptokeep', 'backups', 'backupcount', 'maxbackups', 'backupamount', 'backuplimit'],
    label: 'Backups to keep',
    help: 'How many automatic backups are stored before the oldest is thrown away. More backups means more disk used.',
    type: 'number',
    unit: 'backups',
    min: 1,
    step: 1,
  },

  daily_restart: {
    aliases: ['dailyrestart', 'autorestart', 'scheduledrestart', 'restartdaily', 'dailyreboot', 'dailyscheduledrestart'],
    label: 'Daily restart',
    help: 'Restarts the server once a day. Worth leaving on — it clears accumulated lag, applies pending game updates and forces a fresh save.',
    type: 'boolean',
  },

  restart_time: {
    aliases: ['restarttime', 'dailyrestarttime', 'reboottime', 'restarthour', 'restartschedule'],
    label: 'Daily restart time',
    help: 'When the daily restart happens, in your server time zone. Pick an hour nobody is likely to be playing.',
    type: 'text',
    placeholder: 'e.g. 05:00',
  },

  auto_update: {
    aliases: ['autoupdate', 'gameupdate', 'automaticupdate', 'steamupdate'],
    label: 'Automatic game updates',
    help: 'Keeps the Valheim version current when a patch is released. Off means players on the newer version cannot join until you update manually.',
    type: 'boolean',
  },

  /* --------------------------------------------------------- world presets */

  world_preset: {
    aliases: ['preset', 'worldpreset', 'difficulty', 'difficultypreset', 'gamedifficulty', 'worldmode'],
    label: 'World preset',
    help: 'Applies a whole bundle of difficulty dials at once. It overwrites the individual modifiers below, so choose the preset first and only override what you want different.',
    type: 'enum',
    options: [
      { value: 'normal', label: 'Normal', help: 'The game as shipped — every dial at its default.' },
      { value: 'casual', label: 'Casual', help: 'Softer combat, relaxed death penalty, more resources, no raids, open portals.' },
      { value: 'easy', label: 'Easy', help: 'Gently easier combat and death penalty; everything else stays near normal.' },
      { value: 'hard', label: 'Hard', help: 'Tougher combat, harsher death penalty, tighter portal rules.' },
      { value: 'hardcore', label: 'Hardcore', help: 'Hard, with brutal death rules: carried gear is destroyed and skills are wiped entirely.' },
      { value: 'immersive', label: 'Immersive', help: 'Built for exploration: no map, fire spreads everywhere, limited portals, hard combat.' },
      { value: 'hammer', label: 'Hammer (builder)', help: 'Free building, easy combat, boosted resources, open portals. Counts as a cheat and blocks some achievements.' },
    ],
  },

  /* ------------------------------------------------------- world modifiers */

  combat: {
    aliases: ['combat', 'combatmode', 'combatdifficulty', 'combatmodifier', 'difficultycombat'],
    label: 'Combat difficulty',
    help: 'Scales four things at once: the damage you deal, the damage enemies deal, how fast and large enemies are, and how often they spawn with stars.',
    type: 'enum',
    options: [
      { value: 'veryeasy', label: 'Very easy', help: 'You deal 125% damage; enemies deal 50%.' },
      { value: 'easy', label: 'Easy', help: 'You deal 110% damage; enemies deal 75%.' },
      { value: 'normal', label: 'Normal (default)', help: 'Everyone deals and takes 100%.' },
      { value: 'hard', label: 'Hard', help: 'You deal 85%; enemies deal 150% and are bigger, faster and more often starred.' },
      { value: 'veryhard', label: 'Very hard', help: 'You deal 70%; enemies deal 200% and spawn the nastiest variants.' },
    ],
  },

  death_penalty: {
    aliases: ['deathpenalty', 'deathpenaltymode', 'deathpenaltymodifier', 'ondeath'],
    label: 'Death penalty',
    help: 'What happens to your gear, inventory and skills when you die. This is the setting players notice most — on a shared server with newcomers, casual saves a lot of evenings.',
    type: 'enum',
    options: [
      { value: 'casual', label: 'Casual', help: 'Equipped gear is kept, the rest of your inventory drops, and skills barely suffer.' },
      { value: 'veryeasy', label: 'Very easy', help: 'Everything drops, but you lose almost no skill.' },
      { value: 'easy', label: 'Easy', help: 'Everything drops and you lose less skill than normal.' },
      { value: 'normal', label: 'Normal (default)', help: 'Everything drops and you lose the standard amount of skill.' },
      { value: 'hard', label: 'Hard', help: 'Unequipped items are destroyed outright, and you lose more skill.' },
      { value: 'hardcore', label: 'Hardcore', help: 'Everything you carried is destroyed and all skills are wiped. Permanent.' },
    ],
  },

  resources: {
    aliases: ['resources', 'resourcedrops', 'resourcedrop', 'resourceloot', 'lootmultiplier'],
    label: 'Resource drops',
    help: 'A multiplier on what creatures and lootable objects give you. It does not affect fish, trophies or boss drops, and it changes how much you gather — not how fast you swing.',
    type: 'enum',
    options: [
      { value: 'muchless', label: 'Much less', help: 'Half the normal drops (0.5x).' },
      { value: 'less', label: 'Less', help: 'About three quarters of normal (0.75x).' },
      { value: 'normal', label: 'Normal (default)', help: 'Standard drop rates (1x).' },
      { value: 'more', label: 'More', help: 'One and a half times normal (1.5x).' },
      { value: 'muchmore', label: 'Much more', help: 'Double normal (2x).' },
      { value: 'most', label: 'Most', help: 'Triple normal (3x).' },
    ],
  },

  raids: {
    aliases: ['raids', 'raidmode', 'raidsfrequency', 'raidevents', 'events', 'raidrate'],
    label: 'Raids',
    help: 'How often base raid events such as "the forest is moving" can trigger. Higher steps mean longer gaps. Note that night-time mob attacks still happen even with raids off.',
    type: 'enum',
    options: [
      { value: 'none', label: 'None', help: 'Base raid events are switched off. Night-time monsters still appear.' },
      { value: 'muchless', label: 'Much less', help: 'Roughly a 92 minute gap and a 10% chance each roll.' },
      { value: 'less', label: 'Less', help: 'Roughly a 69 minute gap and a 13% chance each roll.' },
      { value: 'normal', label: 'Normal (default)', help: 'A roll every 46 minutes at 20% — the standard Valheim pace.' },
      { value: 'more', label: 'More', help: 'Roughly a 28 minute gap and a 33% chance each roll.' },
      { value: 'muchmore', label: 'Much more', help: 'Roughly a 14 minute gap and a 67% chance each roll.' },
    ],
  },

  portals: {
    aliases: ['portals', 'portalmode', 'portalrestrictions', 'portalrules', 'portalmodifier'],
    label: 'Portals',
    help: 'What you are allowed to carry through a portal. Casual lets everything through, including metals and ore.',
    type: 'enum',
    options: [
      { value: 'casual', label: 'Casual', help: 'Anything can go through a portal, including ore and metal bars.' },
      { value: 'normal', label: 'Normal (default)', help: 'Portals cannot carry metal ores and bars.' },
      { value: 'hard', label: 'Hard', help: 'Stricter portal rules apply.' },
      { value: 'veryhard', label: 'Very hard', help: 'The harshest rules — effectively no portals. Use "No portals" to be certain.' },
    ],
  },

  /* ---------------------------------------------------------- world rules */

  free_building: {
    aliases: ['nobuildcost', 'freebuild', 'freebuilding', 'buildcost', 'nobuildcosts', 'infinitebuild'],
    label: 'Free building',
    help: 'Building pieces cost no materials. You still have to unlock the recipes the normal way.',
    type: 'boolean',
  },

  player_events: {
    aliases: ['playerevents', 'playertriggeredraids', 'perplayerevents', 'playerbasedevents'],
    label: 'Player-triggered raids',
    help: 'Raids are based on each player\'s own progress instead of the world\'s. Turn this on when veterans and beginners share a server, so a new player in the Meadows does not get raids earned by someone else.',
    type: 'boolean',
  },

  passive_mobs: {
    aliases: ['passivemobs', 'passivecreatures', 'passivemode', 'passiveenemies', 'peaceful'],
    label: 'Passive creatures',
    help: 'Enemies will not attack until you hit them first. Only really suitable for a building or creative world.',
    type: 'boolean',
  },

  no_map: {
    aliases: ['nomap', 'disablemap', 'nominimap', 'mapdisabled'],
    label: 'No map',
    help: 'Removes the map and minimap for everyone. Part of the Immersive preset.',
    type: 'boolean',
  },

  fire_spread: {
    aliases: ['fire', 'firespread', 'firehazard', 'allowfire', 'firespreading'],
    label: 'Fire spreads outside Ashlands',
    help: 'Lets fire spread across all biomes rather than only in the Ashlands. Part of the Immersive preset.',
    type: 'boolean',
  },

  no_portals: {
    aliases: ['noportals', 'disableportals', 'portalsdisabled', 'noportal'],
    label: 'No portals',
    help: 'Turns portals off completely. More reliable than the "very hard" portal setting if you genuinely want them gone.',
    type: 'boolean',
  },

  /* --------------------------------------------------- percentage tuning */

  player_damage: {
    aliases: ['playerdamage', 'damagedealt', 'outgoingdamage'],
    label: 'Player damage',
    help: 'A percentage of normal damage you deal to creatures. 100 is the default.',
    type: 'number',
    unit: '%',
    min: 1,
    max: 1000,
    step: 5,
  },

  enemy_damage: {
    aliases: ['enemydamage', 'damagetaken', 'incomingdamage'],
    label: 'Enemy damage',
    help: 'A percentage of normal damage creatures deal to you. Does not affect damage to your buildings. 100 is the default.',
    type: 'number',
    unit: '%',
    min: 1,
    max: 1000,
    step: 5,
  },

  enemy_speed_size: {
    aliases: ['enemyspeedsize', 'enemyspeed', 'enemysize', 'enemyscaling'],
    label: 'Enemy speed & size',
    help: 'A percentage controlling how fast and how large creatures are. 100 is the default.',
    type: 'number',
    unit: '%',
    min: 50,
    max: 300,
    step: 5,
  },

  enemy_levelup_rate: {
    aliases: ['enemyleveluprate', 'enemylevelup', 'starredenemies', 'enemystarrate'],
    label: 'Enemy level-up rate',
    help: 'How often creatures spawn with stars (making them stronger). 100 is the default.',
    type: 'number',
    unit: '%',
    min: 0,
    max: 500,
    step: 5,
  },

  resource_rate: {
    aliases: ['resourcerate', 'gatherrate', 'dropmultiplier', 'resourcemultiplier'],
    label: 'Resource rate',
    help: 'A flat percentage multiplier on resource drops from everything. 100 is the default.',
    type: 'number',
    unit: '%',
    min: 1,
    max: 1000,
    step: 5,
  },

  skill_gain_rate: {
    aliases: ['skillgainrate', 'skillgain', 'skillrate', 'skillup'],
    label: 'Skill gain rate',
    help: 'How quickly your skills level up. 100 is the default; higher levels faster.',
    type: 'number',
    unit: '%',
    min: 1,
    max: 1000,
    step: 5,
  },

  skill_reduction_rate: {
    aliases: ['skillreductionrate', 'skillloss', 'skilllossrate', 'deathskillloss', 'skillreduction'],
    label: 'Skill loss on death',
    help: 'How much skill you lose when you die. 100 is the default; lower is gentler.',
    type: 'number',
    unit: '%',
    min: 0,
    max: 100,
    step: 1,
  },
};

/* Friendly names for the setting groups Nitrado returns. */
window.SETTINGS_CATEGORY_LABELS = {
  general: 'General',
  config: 'Configuration',
  base: 'Basics',
  basic: 'Basics',
  server: 'Server',
  network: 'Network',
  world: 'World & difficulty',
  gameplay: 'World & difficulty',
  game: 'Game',
  modifiers: 'World modifiers',
  rules: 'World rules',
  backup: 'Backups',
  backups: 'Backups',
  advanced: 'Advanced',
  custom: 'Custom',
  expert: 'Expert settings',
};
