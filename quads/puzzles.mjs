// Source for quads.json: groups listed easiest → hardest. Run: node puzzles.mjs
const P = `
Fruits: APPLE, MANGO, PEAR, PLUM | Planets: MARS, VENUS, SATURN, EARTH | Chocolate bars: TWIX, BOUNTY, MILKY WAY, GALAXY | ___ pie: CUSTARD, MUD, HUMBLE, POT
Dog breeds: BOXER, POODLE, BEAGLE, HUSKY | Card games: SNAP, POKER, RUMMY, BRIDGE | Things with keys: PIANO, MAP, KEYBOARD, LOCK | Fish: SOLE, PIKE, BASS, CARP
Colours: TEAL, CRIMSON, AMBER, VIOLET | Shades of blue: NAVY, COBALT, AZURE, SKY | Weather words: GALE, MIST, SLEET, DRIZZLE | Body of water: BAY, SOUND, STRAIT, GULF
Kitchen tools: WHISK, LADLE, GRATER, TONGS | Chess pieces: KING, ROOK, BISHOP, PAWN | Bird verbs: DUCK, SWALLOW, CRANE, SWIFT | Hidden numbers: OFTEN, WEIGHT, TONE, NONE
Sports with a net: TENNIS, VOLLEYBALL, BADMINTON, NETBALL | Martial arts: JUDO, KARATE, KUNG FU, AIKIDO | Golf terms: BIRDIE, EAGLE, BOGEY, PAR | Snooker words: CUE, RED, BREAK, POT
Pasta: PENNE, FUSILLI, RIGATONI, ORZO | Cheeses: BRIE, FETA, GOUDA, EDAM | Breads: NAAN, PITA, BAGEL, BRIOCHE | Anagrams of TEA: EAT, ATE, ETA, TEA
Ocean animals: SHARK, WHALE, SQUID, EEL | Insects: FLEA, ANT, WASP, MOTH | Cars: BEETLE, MUSTANG, JAGUAR, MINI | Sneaky: SLY, CRAFTY, CUNNING, WILY
Musical instruments: FLUTE, CELLO, OBOE, HARP | Tree types: OAK, ELM, ASH, PINE | Things that are 'grand': PIANO, CANYON, SLAM, PRIX | ___ball: FOOT, BASKET, MEAT, SNOW
Countries: PERU, CHAD, MALI, OMAN | Capitals: LIMA, ROME, OSLO, CAIRO | Rivers: NILE, AMAZON, DANUBE, THAMES | Mountains: EVEREST, K2, KILIMANJARO, DENALI
Shapes: CIRCLE, SQUARE, OVAL, TRIANGLE | Dances: TANGO, SALSA, WALTZ, SAMBA | NATO alphabet: ALPHA, BRAVO, CHARLIE, DELTA | Sauces: PESTO, MAYO, KETCHUP, SALSA VERDE
Superhero powers: FLIGHT, SPEED, STRENGTH, INVISIBILITY | Gym moves: SQUAT, LUNGE, PLANK, CURL | Hair styles: BOB, BUN, BRAID, MULLET | Boys' names that are verbs: BILL, MARK, ROB, PAT
Birds: ROBIN, EAGLE, OWL, PARROT | Batman villains: JOKER, PENGUIN, RIDDLER, BANE | Card terms: ACE, TRUMP, SUIT, DEUCE | Comedy terms: PUNCHLINE, SETUP, GAG, BIT
Gemstones: RUBY, EMERALD, SAPPHIRE, OPAL | Programming languages: PYTHON, JAVA, RUST, SWIFT | Snakes: COBRA, MAMBA, VIPER, ADDER | Coffee drinks: LATTE, MOCHA, FLAT WHITE, CORTADO
Weather: RAIN, SNOW, HAIL, FOG | Social apps: SNAPCHAT, REDDIT, DISCORD, TIKTOK | Things you can tweet: BIRD, NEWS, UPDATE, JOKE | Video game genres: PLATFORMER, SHOOTER, PUZZLE, RACING
Body parts: ELBOW, KNEE, ANKLE, WRIST | Things with hands: CLOCK, POKER, DECK, FARM | Things with teeth: COMB, SAW, ZIP, GEAR | Things with an eye: NEEDLE, STORM, POTATO, HURRICANE
Desserts: TIRAMISU, CHEESECAKE, BROWNIE, SUNDAE | Breakfast foods: PANCAKE, WAFFLE, CEREAL, OMELETTE | Things that are scrambled: EGGS, SIGNAL, JET, PUZZLE | Sweet ___: TOOTH, HEART, POTATO, CORN
Farm animals: COW, PIG, SHEEP, GOAT | Baby animals: CALF, PIGLET, LAMB, KID | Groups of animals: HERD, PACK, FLOCK, SWARM | Animal sounds: MOO, OINK, BAA, NEIGH
Space words: COMET, GALAXY, NEBULA, ORBIT | Astronaut gear: HELMET, SUIT, TETHER, VISOR | Rockets & spacecraft: APOLLO, SOYUZ, SATURN, DRAGON | Greek gods: ZEUS, HERA, ARES, HERMES
Wizard stuff: WAND, CLOAK, SPELL, POTION | Fairy tale figures: GIANT, TROLL, ELF, DRAGON | Things that can be cast: VOTE, NET, SHADOW, DOUBT | Things that can be broken: RECORD, PROMISE, HEART, ICE
Vegetables: CARROT, LEEK, PEA, KALE | Herbs: BASIL, MINT, SAGE, THYME | Spices: CUMIN, PAPRIKA, NUTMEG, CLOVE | Wise: SHREWD, ASTUTE, SMART, CANNY
Tools: HAMMER, DRILL, WRENCH, CHISEL | Fish: TUNA, COD, HADDOCK, TROUT | Hammer ___: SHARK, THROW, TIME, TOE | Golf clubs: DRIVER, IRON, WEDGE, PUTTER
Footwear: BOOT, SANDAL, SNEAKER, CLOG | Hats: BERET, FEDORA, BEANIE, CAP | Car parts: BONNET, WHEEL, BUMPER, CLUTCH | Things that can be pulled: STRINGS, MUSCLE, PRANK, PLUG
Board games: CHESS, MONOPOLY, SCRABBLE, CLUEDO | Math words: SUM, ANGLE, RATIO, MEDIAN | Words before 'time': PRIME, BED, OVER, PLAY | Bedtime stuff: PILLOW, DUVET, PYJAMAS, STORY
Jobs: CHEF, NURSE, PILOT, PLUMBER | Doctors: SURGEON, DENTIST, VET, GP | Pilot ___: LIGHT, WHALE, EPISODE, FISH | Things that are flown: KITE, FLAG, PLANE, DRONE
Instruments with strings: GUITAR, VIOLIN, BANJO, UKULELE | Brass: TRUMPET, TUBA, TROMBONE, BUGLE | Percussion: DRUM, CYMBAL, TRIANGLE, GONG | Bang, crash, ___: BOOM, POP, CLANG, THUD
Metals: SILVER, IRON, COPPER, ZINC | Awards: OSCAR, GRAMMY, EMMY, TONY | ___smith: GOLD, BLACK, LOCK, WORD | ___fish: SWORD, STAR, JELLY, CAT
Elements: OXYGEN, CARBON, HELIUM, NEON | Road signs: STOP, EXIT, YIELD, DETOUR | Lights: STROBE, LASER, SPOT, FLOOD | ___ party: SEARCH, HOUSE, TEA, BLOCK
Ice cream flavours: VANILLA, MINT, COOKIE DOUGH, PISTACHIO | Nuts: CASHEW, ALMOND, PECAN, WALNUT | Things that pop: BALLOON, CORN, BUBBLE, CORK | Things that crack: CODE, WHIP, JOKE, KNUCKLES
Cloud types: CIRRUS, CUMULUS, STRATUS, NIMBUS | Storms: TORNADO, CYCLONE, TYPHOON, BLIZZARD | Computer storage: CLOUD, DRIVE, DISK, CACHE | Silver ___: LINING, SCREEN, SPOON, FOX
Trees that are also names: ASPEN, HOLLY, WILLOW, HAZEL | Flowers: ROSE, DAISY, LILY, TULIP | Eye parts: IRIS, LENS, RETINA, CORNEA | School things: PUPIL, DESK, BELL, CLASS
Sea creatures: CRAB, LOBSTER, OCTOPUS, STARFISH | Star signs: CANCER, LEO, ARIES, LIBRA | Constellations: ORION, DRACO, LYRA, CYGNUS | Celebrity: STAR, ICON, LEGEND, IDOL
Hot drinks: TEA, COCOA, COFFEE, CHAI | Drinking vessels: GLASS, MUG, CUP, TUMBLER | Laboratory kit: PIPETTE, FLASK, BURNER, TEST TUBE | Muppets: KERMIT, GONZO, ANIMAL, BEAKER
Rooms: KITCHEN, ATTIC, CELLAR, STUDY | Furniture: SOFA, TABLE, SHELF, STOOL | Things you can study: LAW, ART, HISTORY, MEDICINE | Things on a desk: LAMP, STAPLER, MOUSE, PEN
Sports teams' animals: BEARS, EAGLES, LIONS, RAPTORS | ___ market: FLEA, BLACK, STOCK, SUPER | Pit ___: BULL, STOP, FALL, CREW | Red ___: CARPET, HERRING, TAPE, PANDA
Camping gear: TENT, TORCH, STOVE, LANTERN | Fire words: FLAME, SPARK, EMBER, BLAZE | Cooking verbs: BAKE, FRY, BOIL, STEAM | Insults: ROAST, BURN, DIS, JAB
Wind instruments: CLARINET, SAXOPHONE, BASSOON, RECORDER | Things you record: VIDEO, SCORE, VOICE, ALBUM | Football positions: STRIKER, WINGER, DEFENDER, SWEEPER | Goal ___: POST, KEEPER, LINE, KICK
Pirate words: AHOY, PLANK, PARROT, TREASURE | Ship parts: HULL, MAST, DECK, RUDDER | Kinds of shower: METEOR, BABY, BRIDAL, APRIL | Cards in a deck: ACE, KING, QUEEN, JACK
Creepy crawlies: TARANTULA, SCORPION, MITE, LOUSE | Small amounts: BIT, DASH, PINCH, DROP | Marks on a page: TICK, CHECK, CROSS, STAR | Clock sounds: TOCK, CHIME, BONG, ALARM
Fast animals: CHEETAH, FALCON, HARE, GAZELLE | Slow animals: SLOTH, SNAIL, TORTOISE, SLUG | Things that are lazy: SUSAN, BONES, DAY, EYE | Running terms: SPRINT, JOG, DASH, LAP
Winter things: SCARF, MITTEN, SLED, ICICLE | Summer things: SUNSCREEN, SANDCASTLE, PICNIC, FLIP FLOP | Spring ___: ROLL, ONION, BREAK, CLEAN | Fall ___: GUY, OUT, BACK, SHORT
Cake types: SPONGE, CARROT, FRUIT, CUP | Things that soak up water: TOWEL, PAPER, MOP, NAPKIN | Clean-up verbs: WIPE, SCRUB, RINSE, DUST | Chimney ___: SWEEP, STACK, POT, BREAST
Shoe parts: SOLE, HEEL, LACE, TONGUE | Things in your mouth: TOOTH, PALATE, LIP, UVULA | Things you can bite: NAILS, BULLET, DUST, APPLE | Chewing ___: GUM, TOBACCO, CUD, TOY
Music genres: ROCK, JAZZ, PUNK, SOUL | Stones: GRANITE, MARBLE, SLATE, FLINT | Things with a heart: ARTICHOKE, LETTUCE, PALM, CITY | Rock, ___: PAPER, SCISSORS, CANDY, BOTTOM
Movie genres: HORROR, COMEDY, WESTERN, THRILLER | Feelings: JOY, ANGER, FEAR, DISGUST | Film jobs: DIRECTOR, EDITOR, PRODUCER, GAFFER | Hold tight: GRIP, CLUTCH, GRASP, CLASP
`;
const ok = [];
for (const line of P.trim().split('\n')) {
  const groups = line.split(' | ').map((g) => { const [name, w] = g.split(': '); return { name, words: w.split(', ').map((x) => x.trim().toUpperCase()) }; });
  const all = groups.flatMap((g) => g.words);
  if (groups.length !== 4 || groups.some((g) => g.words.length !== 4)) throw new Error('bad shape: ' + line);
  if (new Set(all).size !== 16) { console.warn('duplicate word, skipped:', all.filter((w, i) => all.indexOf(w) !== i).join(', ')); continue; }
  ok.push(groups);
}
const fs = await import('node:fs');
fs.writeFileSync(new URL('./quads.json', import.meta.url), JSON.stringify(ok));
console.log(ok.length, 'puzzles');
