/**
 * The Driftle lexicon.
 *
 * Rather than shipping a 300MB embedding matrix, Driftle builds its semantic
 * space from a hand-authored taxonomy. Every word inherits its group's tags and
 * scalar axes, then adds two to five tags of its own. Tags are idf-weighted, so
 * a rare tag like `venom` pulls much harder than a common one like `animal`.
 *
 * The payoff: neighbourhoods are explainable. `wolf` is near `fox` because they
 * share {cat-less predator, pack, forest}, and near `loyalty` only faintly via
 * the human axis. That legibility is what makes the drift mechanic readable -
 * when the answer moves, players can feel *which way* it went.
 *
 * Entry syntax:  word[!|*]:tag,tag,tag
 *   !  -> tier 1 (very common, used in easy rooms)
 *   *  -> tier 3 (obscure, only in hard rooms)
 *   otherwise the word inherits the group's tier.
 */

export type ScalarKey =
  | 'co' // concrete   0 abstract .. 1 physical
  | 'an' // animate    0 inert .. 1 alive
  | 'sz' // size       0 tiny .. 1 vast
  | 'hu' // human      0 apart from people .. 1 social/human
  | 'na' // natural    0 manufactured .. 1 natural
  | 'mo' // motion     0 static .. 1 fast moving
  | 'va' // valence    0 negative .. 1 positive
  | 'it' // intensity  0 calm .. 1 intense
  | 'te' // tech       0 pre-industrial .. 1 high technology
  | 'tm'; // temporal  0 a thing .. 1 an event

export interface RawGroup {
  key: string;
  tier: 1 | 2 | 3;
  tags: string[];
  s: Partial<Record<ScalarKey, number>>;
  words: string;
}

export const GROUPS: RawGroup[] = [
  {
    key: 'predators',
    tier: 2,
    tags: ['animal', 'mammal', 'wild', 'fauna'],
    s: { co: 0.95, an: 1, sz: 0.7, hu: 0.15, na: 0.95, mo: 0.8, va: 0.45, it: 0.75, te: 0.02, tm: 0.25 },
    words: `
      tiger!:cat,predator,stripes,jungle
      lion!:cat,predator,mane,savanna,pride
      leopard:cat,predator,spots,stealth
      jaguar:cat,predator,spots,jungle
      cheetah:cat,predator,speed,savanna
      panther*:cat,predator,stealth,dark
      wolf!:pack,predator,howl,forest
      fox!:cunning,predator,forest,small
      bear!:predator,forest,strong,heavy
      hyena*:predator,scavenger,savanna
      cougar*:cat,predator,mountain
      lynx*:cat,predator,forest
    `,
  },
  {
    key: 'grazers',
    tier: 2,
    tags: ['animal', 'mammal', 'wild', 'fauna', 'herd'],
    s: { co: 0.95, an: 1, sz: 0.75, hu: 0.12, na: 0.97, mo: 0.6, va: 0.6, it: 0.35, te: 0.02, tm: 0.25 },
    words: `
      elephant!:huge,trunk,tusk,savanna,memory
      giraffe:tall,neck,spots,savanna
      zebra:stripes,savanna,hoofed
      deer!:forest,antler,timid,hoofed
      moose*:forest,antler,huge,hoofed
      bison*:plains,shaggy,heavy,hoofed
      camel:desert,hump,thirst,hoofed
      rhino*:horn,heavy,armour,savanna
      antelope*:savanna,speed,horn,hoofed
      buffalo:plains,heavy,horn,hoofed
      llama*:mountain,wool,spit,hoofed
    `,
  },
  {
    key: 'domestic',
    tier: 1,
    tags: ['animal', 'mammal', 'domestic', 'fauna'],
    s: { co: 0.95, an: 1, sz: 0.5, hu: 0.75, na: 0.65, mo: 0.5, va: 0.72, it: 0.3, te: 0.05, tm: 0.25 },
    words: `
      dog!:pet,loyal,bark,companion
      cat!:pet,purr,whiskers,claws
      horse!:ride,gallop,mane,farm,strong
      cow!:farm,milk,herd,grass
      pig!:farm,mud,snout
      sheep!:farm,wool,flock,grass
      goat:farm,horn,climb,milk
      donkey:farm,stubborn,carry
      rabbit!:pet,burrow,ears,timid
      hamster*:pet,small,cage,rodent
      pony:ride,small,mane
    `,
  },
  {
    key: 'birds',
    tier: 2,
    tags: ['animal', 'bird', 'wing', 'fauna', 'flight'],
    s: { co: 0.95, an: 1, sz: 0.35, hu: 0.2, na: 0.95, mo: 0.9, va: 0.62, it: 0.4, te: 0.02, tm: 0.3 },
    words: `
      eagle!:predator,talon,mountain,soar,proud
      hawk:predator,talon,soar,keen
      owl!:predator,night,silent,wise
      sparrow:small,garden,common
      raven*:black,clever,omen,dark
      crow:black,clever,common
      swan:water,white,grace,elegant
      penguin!:water,cold,ice,swim,flightless
      parrot:colour,tropical,mimic,talk
      pigeon:city,common,coo
      chicken!:farm,egg,coop,flightless
      flamingo*:pink,water,tropical,leg
      seagull:coast,sea,scavenger
    `,
  },
  {
    key: 'sea-life',
    tier: 2,
    tags: ['animal', 'fauna', 'ocean', 'water', 'swim'],
    s: { co: 0.95, an: 1, sz: 0.55, hu: 0.12, na: 0.97, mo: 0.7, va: 0.5, it: 0.45, te: 0.02, tm: 0.25 },
    words: `
      whale!:huge,mammal,song,deep
      dolphin!:mammal,clever,play,pod
      shark!:predator,teeth,fear,fin
      octopus:tentacle,clever,ink,deep
      jellyfish:sting,drift,translucent
      crab:shell,claw,shore,sideways
      lobster*:shell,claw,deep,food
      squid*:tentacle,ink,deep
      seal:mammal,shore,cold,bark
      salmon:fish,river,swim,food
      tuna:fish,food,deep
      coral*:reef,colony,reef,slow
    `,
  },
  {
    key: 'reptiles',
    tier: 2,
    tags: ['animal', 'fauna', 'wild', 'scale', 'coldblood'],
    s: { co: 0.95, an: 1, sz: 0.45, hu: 0.1, na: 0.97, mo: 0.55, va: 0.32, it: 0.6, te: 0.02, tm: 0.25 },
    words: `
      snake!:venom,slither,fear,coil
      lizard:scurry,desert,tail
      crocodile:predator,river,teeth,armour
      turtle!:shell,slow,patient,water
      frog!:amphibian,pond,jump,croak
      toad*:amphibian,warty,damp
      chameleon*:colour,camouflage,tongue
      iguana*:desert,spine,tail
      python*:venom,coil,constrict,jungle
      cobra*:venom,hood,fear,strike
      gecko*:climb,small,night
    `,
  },
  {
    key: 'small-fauna',
    tier: 2,
    tags: ['animal', 'fauna', 'small', 'wild'],
    s: { co: 0.95, an: 1, sz: 0.15, hu: 0.25, na: 0.92, mo: 0.7, va: 0.42, it: 0.35, te: 0.02, tm: 0.25 },
    words: `
      mouse!:rodent,tiny,squeak,cheese
      rat:rodent,city,sewer,plague
      squirrel!:rodent,tree,acorn,bushy
      beaver*:rodent,dam,river,wood
      hedgehog*:spine,curl,garden,night
      bat:night,wing,cave,flight
      otter*:river,play,swim,fur
      badger*:burrow,night,stripe
      raccoon*:mask,night,city,clever
      mole*:burrow,blind,soil,dig
      ferret*:slender,burrow,pet
    `,
  },
  {
    key: 'insects',
    tier: 2,
    tags: ['animal', 'fauna', 'insect', 'tiny', 'wild'],
    s: { co: 0.9, an: 0.95, sz: 0.05, hu: 0.22, na: 0.95, mo: 0.75, va: 0.38, it: 0.4, te: 0.02, tm: 0.25 },
    words: `
      bee!:sting,honey,hive,flower,buzz
      ant!:colony,work,tiny,soil
      butterfly!:wing,colour,flower,grace,change
      spider!:web,eight,fear,silk
      mosquito:sting,blood,itch,buzz
      beetle:shell,crawl,common
      moth:wing,night,lamp,dust
      wasp*:sting,nest,anger,buzz
      dragonfly*:wing,pond,dart,shimmer
      grasshopper*:jump,field,chirp
      worm:soil,crawl,blind,slow
      caterpillar*:crawl,leaf,change
    `,
  },
  {
    key: 'trees',
    tier: 2,
    tags: ['plant', 'flora', 'wood', 'forest', 'growth'],
    s: { co: 0.95, an: 0.55, sz: 0.78, hu: 0.25, na: 0.98, mo: 0.05, va: 0.68, it: 0.2, te: 0.02, tm: 0.15 },
    words: `
      oak!:strong,acorn,ancient,timber
      pine!:needle,evergreen,cone,mountain
      willow*:droop,river,slender,sorrow
      birch*:pale,bark,slender,north
      maple:leaf,syrup,autumn
      cedar*:aroma,evergreen,timber
      palm:tropical,coast,frond
      redwood*:huge,ancient,tall
      bamboo*:fast,hollow,green,asia
      shrub*:small,hedge,garden
      forest!:many,green,wild,shade
    `,
  },
  {
    key: 'flowers',
    tier: 2,
    tags: ['plant', 'flora', 'bloom', 'garden', 'beauty'],
    s: { co: 0.9, an: 0.5, sz: 0.12, hu: 0.45, na: 0.95, mo: 0.05, va: 0.82, it: 0.25, te: 0.02, tm: 0.2 },
    words: `
      rose!:red,thorn,love,scent
      tulip:spring,bulb,colour
      daisy:white,field,simple
      lily:white,scent,elegant
      orchid*:rare,exotic,elegant
      sunflower:yellow,tall,sun
      lavender*:purple,scent,calm
      violet*:purple,small,shy
      jasmine*:scent,white,night
      poppy*:red,field,memory,sleep
      blossom:spring,petal,brief
    `,
  },
  {
    key: 'fruit',
    tier: 1,
    tags: ['plant', 'food', 'fruit', 'sweet', 'edible'],
    s: { co: 0.95, an: 0.35, sz: 0.15, hu: 0.6, na: 0.88, mo: 0.05, va: 0.8, it: 0.25, te: 0.05, tm: 0.15 },
    words: `
      apple!:red,crisp,orchard,common
      banana!:yellow,peel,tropical,soft
      orange!:citrus,juice,peel,round
      grape:vine,cluster,wine,small
      lemon:citrus,sour,yellow
      peach:soft,fuzz,summer,stone
      cherry:small,red,stone,sweet
      mango*:tropical,soft,juice
      strawberry:red,seed,summer,sweet
      melon:large,juice,summer
      pear:soft,green,orchard
      pineapple*:tropical,spike,sweet
    `,
  },
  {
    key: 'vegetables',
    tier: 2,
    tags: ['plant', 'food', 'vegetable', 'edible', 'garden'],
    s: { co: 0.95, an: 0.35, sz: 0.15, hu: 0.62, na: 0.85, mo: 0.03, va: 0.65, it: 0.2, te: 0.05, tm: 0.15 },
    words: `
      carrot!:orange,root,crunch
      potato!:root,starch,soil,common
      onion:layer,tears,pungent
      tomato:red,round,juice
      lettuce:leaf,green,salad
      pepper:spice,colour,heat
      cabbage*:leaf,dense,green
      pumpkin:orange,autumn,large
      cucumber*:green,cool,crisp
      spinach*:leaf,green,iron
      garlic:pungent,clove,aroma
      mushroom:fungus,damp,forest
    `,
  },
  {
    key: 'dishes',
    tier: 1,
    tags: ['food', 'meal', 'cooked', 'edible', 'kitchen'],
    s: { co: 0.9, an: 0.15, sz: 0.2, hu: 0.85, na: 0.4, mo: 0.05, va: 0.8, it: 0.3, te: 0.15, tm: 0.3 },
    words: `
      bread!:loaf,wheat,bake,staple
      cheese!:milk,age,dairy
      soup:warm,bowl,liquid,comfort
      pizza!:slice,cheese,bake,share
      pasta:noodle,italy,wheat
      rice!:grain,staple,white
      cake!:sweet,bake,party,sugar
      sandwich:slice,quick,lunch
      stew*:warm,slow,pot,comfort
      curry*:spice,heat,aroma
      noodle:long,soup,asia
      pancake*:flat,sweet,breakfast
      chocolate!:sweet,dark,cocoa,treat
      honey:sweet,bee,gold,syrup
    `,
  },
  {
    key: 'drinks',
    tier: 1,
    tags: ['food', 'drink', 'liquid', 'edible'],
    s: { co: 0.85, an: 0.1, sz: 0.15, hu: 0.82, na: 0.45, mo: 0.3, va: 0.75, it: 0.35, te: 0.15, tm: 0.3 },
    words: `
      water!:clear,thirst,pure,essential
      coffee!:bitter,morning,bean,awake
      tea!:leaf,warm,calm,cup
      milk!:white,dairy,cow,calcium
      juice:fruit,sweet,cold
      wine:grape,red,age,celebrate
      beer:hops,foam,bitter,social
      cider*:apple,autumn,sharp
      soda:fizz,sweet,cold
      whiskey*:strong,barrel,amber,burn
      smoothie*:blend,fruit,thick
    `,
  },
  {
    key: 'body',
    tier: 1,
    tags: ['body', 'anatomy', 'flesh', 'self'],
    s: { co: 0.92, an: 0.95, sz: 0.2, hu: 0.9, na: 0.9, mo: 0.45, va: 0.55, it: 0.4, te: 0.02, tm: 0.15 },
    words: `
      hand!:finger,grip,touch,work
      heart!:blood,beat,love,chest
      eye!:sight,see,gaze,light
      brain!:mind,think,skull,nerve
      bone:skeleton,hard,white
      blood:red,vein,life,flow
      skin:touch,cover,soft
      tooth:bite,white,hard
      lung*:breath,air,chest
      spine*:back,bone,column
      shoulder:arm,carry,broad
      throat*:voice,swallow,narrow
      knee:joint,bend,leg
      hair:strand,head,grow
    `,
  },
  {
    key: 'health',
    tier: 2,
    tags: ['health', 'body', 'medicine', 'care'],
    s: { co: 0.55, an: 0.7, sz: 0.3, hu: 0.9, na: 0.55, mo: 0.3, va: 0.35, it: 0.6, te: 0.5, tm: 0.6 },
    words: `
      fever:heat,illness,sweat
      wound:cut,pain,heal,blood
      medicine:cure,pill,heal
      surgery*:cut,operate,hospital,risk
      bandage*:wrap,wound,cloth
      vaccine*:immune,needle,protect
      illness:weak,suffer,body
      healing:mend,time,recover,hope
      pain!:hurt,sharp,suffer
      rest:calm,recover,sleep
      doctor!:heal,clinic,expert
      nurse:care,ward,kind
    `,
  },
  {
    key: 'joy',
    tier: 1,
    tags: ['emotion', 'feeling', 'mind', 'positive', 'inner'],
    s: { co: 0.05, an: 0.6, sz: 0.4, hu: 0.95, na: 0.6, mo: 0.4, va: 0.95, it: 0.7, te: 0.02, tm: 0.7 },
    words: `
      joy!:delight,bright,warm
      happiness!:content,warm,smile
      love!:bond,warm,deep,desire
      hope!:future,light,faith
      pride:self,tall,honour
      relief:release,calm,after
      wonder:awe,question,vast
      delight:sudden,bright,pleasure
      gratitude*:thanks,humble,warm
      excitement:energy,fast,anticipate
      comfort:warm,soft,safe
      affection*:tender,close,warm
    `,
  },
  {
    key: 'sorrow',
    tier: 1,
    tags: ['emotion', 'feeling', 'mind', 'negative', 'inner'],
    s: { co: 0.05, an: 0.6, sz: 0.45, hu: 0.95, na: 0.6, mo: 0.3, va: 0.08, it: 0.72, te: 0.02, tm: 0.7 },
    words: `
      fear!:threat,cold,freeze,danger
      anger!:heat,red,burn,rage
      sadness!:grey,weight,tears
      grief:loss,deep,mourn,heavy
      envy*:want,bitter,green
      shame:hide,burn,small
      guilt:weight,wrong,conscience
      loneliness*:empty,apart,cold
      despair*:dark,bottom,hopeless
      regret:past,wish,ache
      dread*:coming,cold,slow
      jealousy*:want,guard,bitter
    `,
  },
  {
    key: 'mind',
    tier: 2,
    tags: ['mind', 'thought', 'abstract', 'inner', 'idea'],
    s: { co: 0.05, an: 0.55, sz: 0.45, hu: 0.92, na: 0.5, mo: 0.3, va: 0.62, it: 0.45, te: 0.15, tm: 0.55 },
    words: `
      memory!:past,recall,fade,store
      dream!:sleep,vision,strange,wish
      idea!:spark,new,think
      logic:reason,order,rigour
      doubt:question,waver,unsure
      belief:hold,faith,conviction
      focus:narrow,attention,sharp
      imagination*:create,vision,free
      instinct*:quick,body,unthought
      wisdom:age,deep,judgement
      curiosity:question,seek,open
      genius*:rare,bright,gift
    `,
  },
  {
    key: 'language',
    tier: 2,
    tags: ['language', 'communication', 'human', 'signal', 'meaning'],
    s: { co: 0.25, an: 0.5, sz: 0.35, hu: 0.98, na: 0.35, mo: 0.4, va: 0.62, it: 0.4, te: 0.3, tm: 0.6 },
    words: `
      word!:speech,meaning,unit
      story!:tale,narrate,arc
      question:ask,open,seek
      answer:reply,close,solve
      letter:write,post,symbol
      poem:verse,rhythm,beauty
      whisper:quiet,secret,soft
      shout:loud,voice,alarm
      silence!:quiet,absence,still
      rumour*:spread,unsure,gossip
      promise:bind,future,trust
      argument:clash,reason,heat
      language:system,tongue,shared
    `,
  },
  {
    key: 'people',
    tier: 1,
    tags: ['person', 'human', 'social', 'role'],
    s: { co: 0.75, an: 1, sz: 0.45, hu: 1, na: 0.7, mo: 0.45, va: 0.68, it: 0.4, te: 0.15, tm: 0.35 },
    words: `
      mother!:parent,care,family,warm
      father!:parent,family,guard
      child!:young,small,grow,play
      friend!:bond,trust,social
      stranger:unknown,apart,new
      neighbour*:near,street,social
      brother:family,sibling,bond
      sister:family,sibling,bond
      hero:brave,save,honour
      rival:compete,oppose,mirror
      crowd:many,dense,noise
      elder*:age,wisdom,respect
    `,
  },
  {
    key: 'jobs',
    tier: 2,
    tags: ['person', 'work', 'human', 'role', 'craft'],
    s: { co: 0.7, an: 0.95, sz: 0.42, hu: 1, na: 0.4, mo: 0.5, va: 0.62, it: 0.42, te: 0.4, tm: 0.45 },
    words: `
      teacher!:school,learn,guide
      farmer!:field,crop,soil,harvest
      soldier:war,order,duty,brave
      sailor:sea,ship,voyage
      baker:bread,oven,dawn
      smith*:forge,metal,hammer
      pilot:flight,sky,control
      builder:construct,brick,site
      miner*:deep,coal,dark,dig
      chef:kitchen,cook,taste
      artist:create,paint,vision
      scientist:study,test,truth
      merchant*:trade,goods,coin
    `,
  },
  {
    key: 'clothing',
    tier: 1,
    tags: ['clothing', 'wear', 'cloth', 'object', 'made'],
    s: { co: 0.92, an: 0.05, sz: 0.25, hu: 0.9, na: 0.25, mo: 0.2, va: 0.68, it: 0.25, te: 0.2, tm: 0.15 },
    words: `
      shirt!:torso,button,cotton
      coat!:warm,outer,heavy
      hat!:head,brim,cover
      shoe!:foot,walk,leather
      glove:hand,warm,pair
      scarf:neck,warm,wrap
      dress:elegant,flow,formal
      jacket:outer,zip,casual
      sock:foot,pair,soft
      boot:foot,heavy,mud
      uniform*:same,order,role
      cloak*:old,drape,mystery
    `,
  },
  {
    key: 'fabric',
    tier: 3,
    tags: ['material', 'cloth', 'texture', 'made', 'object'],
    s: { co: 0.9, an: 0.05, sz: 0.25, hu: 0.75, na: 0.45, mo: 0.1, va: 0.62, it: 0.15, te: 0.25, tm: 0.1 },
    words: `
      silk:smooth,shine,luxury,thread
      wool:warm,sheep,thick
      cotton:soft,plant,common
      leather:hide,tough,animal
      velvet:soft,rich,nap
      linen:cool,plant,crisp
      thread:thin,sew,line
      lace:fine,hole,delicate
      denim:tough,blue,work
      satin*:smooth,shine,soft
      fur:animal,warm,thick
    `,
  },
  {
    key: 'furniture',
    tier: 1,
    tags: ['furniture', 'object', 'home', 'made', 'wood'],
    s: { co: 0.97, an: 0.02, sz: 0.5, hu: 0.85, na: 0.2, mo: 0.02, va: 0.65, it: 0.15, te: 0.15, tm: 0.05 },
    words: `
      chair!:sit,leg,back
      table!:flat,surface,gather
      bed!:sleep,rest,soft
      couch:sit,soft,lounge
      desk:work,write,drawer
      shelf:store,flat,book
      cupboard*:store,door,kitchen
      mirror!:reflect,glass,self
      lamp:light,shade,glow
      rug*:floor,soft,pattern
      drawer*:slide,store,hidden
      wardrobe*:store,clothing,tall
    `,
  },
  {
    key: 'kitchen',
    tier: 2,
    tags: ['tool', 'kitchen', 'object', 'made', 'utensil'],
    s: { co: 0.97, an: 0.02, sz: 0.15, hu: 0.85, na: 0.15, mo: 0.15, va: 0.6, it: 0.2, te: 0.25, tm: 0.1 },
    words: `
      knife!:blade,cut,sharp
      spoon!:scoop,round,soup
      fork:prong,stab,eat
      plate:flat,round,serve
      bowl:round,hold,soup
      cup!:hold,drink,handle
      pot:cook,deep,heat
      pan:cook,flat,fry
      kettle:boil,steam,whistle
      oven:heat,bake,box
      jar*:glass,store,lid
      whisk*:beat,wire,mix
    `,
  },
  {
    key: 'tools',
    tier: 2,
    tags: ['tool', 'object', 'made', 'work', 'craft'],
    s: { co: 0.97, an: 0.02, sz: 0.28, hu: 0.75, na: 0.12, mo: 0.35, va: 0.55, it: 0.45, te: 0.35, tm: 0.15 },
    words: `
      hammer!:strike,nail,heavy
      saw:cut,teeth,wood
      drill:spin,hole,bore
      wrench*:turn,bolt,grip
      axe:chop,wood,blade
      ladder:climb,rung,reach
      rope:tie,twist,pull
      nail:thin,strike,fix
      screw*:spiral,turn,fix
      chisel*:carve,edge,stone
      shovel:dig,soil,scoop
      needle:thin,sharp,sew
    `,
  },
  {
    key: 'machines',
    tier: 2,
    tags: ['machine', 'made', 'object', 'industry', 'power'],
    s: { co: 0.95, an: 0.02, sz: 0.68, hu: 0.6, na: 0.05, mo: 0.6, va: 0.5, it: 0.6, te: 0.8, tm: 0.3 },
    words: `
      engine!:power,burn,turn,drive
      motor:spin,power,electric
      gear:tooth,turn,mesh
      piston*:push,cylinder,rhythm
      turbine*:spin,blade,power
      crane:lift,tall,site
      pump*:push,fluid,pressure
      generator*:power,electric,make
      valve*:flow,control,shut
      conveyor*:belt,move,factory
      furnace*:heat,melt,industry
      lever:push,pivot,force
    `,
  },
  {
    key: 'computing',
    tier: 2,
    tags: ['tech', 'digital', 'made', 'object', 'information'],
    s: { co: 0.6, an: 0.05, sz: 0.3, hu: 0.72, na: 0.02, mo: 0.5, va: 0.58, it: 0.45, te: 1, tm: 0.4 },
    words: `
      computer!:screen,process,digital
      keyboard:type,key,input
      screen!:display,glow,pixel
      internet:network,global,connect
      software*:code,program,logic
      algorithm*:step,logic,solve
      database*:store,query,table
      pixel*:tiny,dot,display
      cursor*:point,blink,move
      server:host,rack,serve
      network:link,node,connect
      robot:machine,move,autonomous
      signal:carry,wave,message
    `,
  },
  {
    key: 'land-vehicles',
    tier: 1,
    tags: ['vehicle', 'travel', 'made', 'object', 'road'],
    s: { co: 0.97, an: 0.02, sz: 0.6, hu: 0.7, na: 0.05, mo: 0.92, va: 0.6, it: 0.55, te: 0.7, tm: 0.4 },
    words: `
      car!:road,wheel,drive,engine
      bicycle!:pedal,wheel,light
      train!:rail,long,station,carriage
      bus:public,route,large
      truck:cargo,heavy,haul
      motorcycle:fast,two,loud
      tractor*:farm,slow,field
      wagon*:cart,old,horse
      subway*:tunnel,city,underground
      scooter*:small,light,street
      tram*:rail,city,wire
    `,
  },
  {
    key: 'air-sea-vehicles',
    tier: 2,
    tags: ['vehicle', 'travel', 'made', 'object', 'voyage'],
    s: { co: 0.96, an: 0.02, sz: 0.72, hu: 0.62, na: 0.05, mo: 0.95, va: 0.62, it: 0.6, te: 0.78, tm: 0.4 },
    words: `
      ship!:sea,hull,voyage,sail
      boat!:small,water,row
      airplane!:flight,wing,sky,jet
      helicopter:rotor,hover,sky
      rocket!:space,launch,thrust,fire
      submarine*:deep,dive,ocean,silent
      canoe*:paddle,river,narrow
      ferry*:cross,water,route
      yacht*:sail,luxury,sea
      glider*:silent,wing,air
      raft*:float,simple,drift
    `,
  },
  {
    key: 'buildings',
    tier: 1,
    tags: ['building', 'place', 'made', 'structure', 'shelter'],
    s: { co: 0.97, an: 0.02, sz: 0.82, hu: 0.9, na: 0.08, mo: 0.02, va: 0.62, it: 0.3, te: 0.4, tm: 0.08 },
    words: `
      house!:home,roof,family,shelter
      castle!:stone,wall,old,defend
      tower!:tall,narrow,rise
      bridge!:cross,span,link
      church:worship,spire,stone
      school!:learn,class,child
      hospital:heal,ward,urgent
      factory:make,industry,smoke
      library!:book,quiet,store
      museum:display,past,art
      barn*:farm,store,hay
      lighthouse*:coast,beam,warn
      cottage*:small,rural,cosy
    `,
  },
  {
    key: 'home-parts',
    tier: 2,
    tags: ['building', 'home', 'part', 'made', 'structure'],
    s: { co: 0.97, an: 0.02, sz: 0.45, hu: 0.88, na: 0.1, mo: 0.05, va: 0.62, it: 0.2, te: 0.25, tm: 0.05 },
    words: `
      door!:open,enter,hinge
      window!:glass,light,view
      roof:cover,top,shelter
      wall:divide,solid,block
      floor:below,flat,stand
      stairs:climb,step,between
      kitchen:cook,food,warm
      garden!:plant,green,grow
      chimney*:smoke,rise,brick
      cellar*:below,cool,dark
      attic*:above,dust,store
      corridor*:long,narrow,pass
    `,
  },
  {
    key: 'city',
    tier: 2,
    tags: ['place', 'city', 'human', 'made', 'public'],
    s: { co: 0.85, an: 0.15, sz: 0.85, hu: 0.98, na: 0.1, mo: 0.55, va: 0.55, it: 0.55, te: 0.6, tm: 0.25 },
    words: `
      city!:dense,many,street,noise
      street!:road,line,walk
      market!:trade,stall,noise,goods
      avenue*:wide,tree,street
      park:green,rest,public
      station:travel,wait,platform
      harbour*:ship,water,dock
      suburb*:quiet,house,edge
      alley*:narrow,dark,between
      plaza*:open,stone,gather
      village:small,rural,quiet
    `,
  },
  {
    key: 'landscape',
    tier: 1,
    tags: ['nature', 'place', 'land', 'earth', 'wild'],
    s: { co: 0.9, an: 0.15, sz: 0.92, hu: 0.2, na: 1, mo: 0.08, va: 0.68, it: 0.45, te: 0.02, tm: 0.1 },
    words: `
      mountain!:high,rock,peak,climb
      valley:low,between,green
      desert!:dry,sand,heat,empty
      island!:water,alone,shore
      cliff:steep,drop,edge
      cave:dark,hollow,deep
      hill:gentle,rise,green
      field!:flat,grass,crop
      canyon*:deep,carve,rock
      meadow*:grass,flower,soft
      swamp*:wet,mud,murk
      tundra*:cold,flat,bare
      volcano:fire,erupt,ash,mountain
    `,
  },
  {
    key: 'water-bodies',
    tier: 1,
    tags: ['nature', 'water', 'place', 'flow', 'earth'],
    s: { co: 0.88, an: 0.15, sz: 0.85, hu: 0.28, na: 1, mo: 0.6, va: 0.68, it: 0.45, te: 0.02, tm: 0.15 },
    words: `
      ocean!:vast,salt,deep,blue
      river!:flow,long,bank,current
      lake!:still,fresh,shore
      sea:salt,wave,wide
      stream:small,flow,clear
      waterfall:fall,roar,mist
      pond:small,still,frog
      wave:crest,break,rhythm
      tide*:rise,moon,cycle
      glacier*:ice,slow,cold,carve
      rapids*:fast,rock,white
      marsh*:shallow,reed,wet
    `,
  },
  {
    key: 'weather',
    tier: 1,
    tags: ['weather', 'nature', 'sky', 'event', 'air'],
    s: { co: 0.5, an: 0.1, sz: 0.8, hu: 0.4, na: 1, mo: 0.75, va: 0.5, it: 0.65, te: 0.02, tm: 0.9 },
    words: `
      rain!:fall,wet,grey,drop
      snow!:white,cold,soft,fall
      storm!:wind,rage,dark,violent
      wind!:blow,move,invisible
      cloud!:float,white,sky
      fog:thick,grey,hide,damp
      thunder:loud,boom,fear
      lightning:flash,strike,electric
      frost*:white,cold,crisp,morning
      drought*:dry,long,thirst
      hail*:ice,strike,hard
      breeze*:gentle,cool,light
      rainbow:colour,arc,after,hope
    `,
  },
  {
    key: 'space',
    tier: 2,
    tags: ['space', 'sky', 'cosmos', 'vast', 'nature'],
    s: { co: 0.6, an: 0.05, sz: 1, hu: 0.2, na: 0.98, mo: 0.55, va: 0.68, it: 0.6, te: 0.35, tm: 0.35 },
    words: `
      star!:light,burn,night,distant
      moon!:night,pale,orbit,tide
      sun!:light,heat,day,burn
      planet:orbit,round,world
      galaxy:spiral,vast,many
      comet*:ice,tail,streak
      orbit*:circle,path,gravity
      eclipse*:shadow,rare,align
      meteor*:fall,streak,burn
      nebula*:cloud,colour,birth
      cosmos*:all,vast,order
      gravity:pull,force,invisible
    `,
  },
  {
    key: 'fire-light',
    tier: 2,
    tags: ['energy', 'light', 'heat', 'element', 'force'],
    s: { co: 0.55, an: 0.15, sz: 0.5, hu: 0.5, na: 0.72, mo: 0.75, va: 0.5, it: 0.85, te: 0.25, tm: 0.7 },
    words: `
      fire!:burn,heat,flame,danger
      flame:tongue,flicker,bright
      smoke:grey,rise,choke
      ash*:grey,after,dust
      spark:small,sudden,ignite
      ember*:glow,dying,warm
      candle:wax,small,glow
      torch:carry,flame,light
      shadow!:dark,absence,follow
      glow:soft,warm,steady
      blaze*:huge,fierce,burn
      lantern*:carry,glass,warm
    `,
  },
  {
    key: 'metals',
    tier: 2,
    tags: ['material', 'metal', 'hard', 'element', 'substance'],
    s: { co: 0.98, an: 0.02, sz: 0.4, hu: 0.55, na: 0.55, mo: 0.05, va: 0.58, it: 0.35, te: 0.55, tm: 0.05 },
    words: `
      gold!:precious,shine,yellow,wealth
      silver!:shine,pale,precious
      iron!:strong,rust,grey,tool
      steel:strong,forge,blade
      copper:red,wire,conduct
      bronze*:alloy,age,statue
      lead*:heavy,dull,toxic
      tin*:light,dull,can
      brass*:alloy,yellow,horn
      platinum*:rare,white,precious
      rust*:decay,red,age
    `,
  },
  {
    key: 'minerals',
    tier: 2,
    tags: ['material', 'stone', 'earth', 'hard', 'substance'],
    s: { co: 0.98, an: 0.02, sz: 0.4, hu: 0.35, na: 0.92, mo: 0.02, va: 0.58, it: 0.3, te: 0.15, tm: 0.05 },
    words: `
      rock!:hard,grey,heavy
      stone!:solid,cold,build
      diamond:precious,hard,shine,rare
      crystal:clear,facet,grow
      sand!:grain,loose,desert,shore
      clay:soft,mould,earth
      marble*:smooth,white,carve
      granite*:speckle,hard,build
      coal*:black,burn,deep
      salt:white,grain,taste,sea
      quartz*:clear,hard,crystal
      pebble*:small,smooth,round
    `,
  },
  {
    key: 'colours',
    tier: 1,
    tags: ['colour', 'sight', 'quality', 'abstract', 'perception'],
    s: { co: 0.35, an: 0.05, sz: 0.3, hu: 0.6, na: 0.6, mo: 0.15, va: 0.68, it: 0.4, te: 0.15, tm: 0.1 },
    words: `
      red!:blood,fire,bold,warm
      blue!:sky,water,calm,cool
      green!:grass,leaf,growth
      yellow!:sun,bright,warm
      purple:royal,deep,rare
      black!:dark,night,absence
      white!:pure,light,blank
      grey:dull,between,cloud
      amber*:warm,glow,resin
      crimson*:deep,red,rich
      scarlet*:bright,red,vivid
      indigo*:deep,blue,dye
    `,
  },
  {
    key: 'shape',
    tier: 2,
    tags: ['shape', 'form', 'abstract', 'geometry', 'quality'],
    s: { co: 0.3, an: 0.02, sz: 0.4, hu: 0.5, na: 0.4, mo: 0.1, va: 0.55, it: 0.2, te: 0.35, tm: 0.05 },
    words: `
      circle!:round,closed,perfect
      square!:four,equal,corner
      triangle:three,point,angle
      line:straight,thin,path
      curve:bend,smooth,arc
      spiral:turn,inward,coil
      angle:corner,degree,meet
      sphere*:round,solid,ball
      cube*:six,solid,block
      edge:border,sharp,limit
      knot:tangle,tie,bind
      pattern:repeat,order,design
    `,
  },
  {
    key: 'number',
    tier: 2,
    tags: ['number', 'math', 'abstract', 'quantity', 'logic'],
    s: { co: 0.05, an: 0.02, sz: 0.4, hu: 0.6, na: 0.35, mo: 0.1, va: 0.55, it: 0.25, te: 0.55, tm: 0.15 },
    words: `
      zero!:none,empty,origin
      infinity*:endless,vast,limit
      fraction*:part,divide,ratio
      sum:add,total,whole
      average*:middle,typical,mean
      equation*:balance,solve,symbol
      measure:size,compare,unit
      count:tally,one,number
      ratio*:compare,proportion
      geometry*:shape,space,proof
      probability*:chance,odds,uncertain
      total:all,final,whole
    `,
  },
  {
    key: 'science',
    tier: 2,
    tags: ['science', 'knowledge', 'study', 'truth', 'abstract'],
    s: { co: 0.28, an: 0.15, sz: 0.5, hu: 0.75, na: 0.6, mo: 0.3, va: 0.65, it: 0.45, te: 0.85, tm: 0.45 },
    words: `
      atom!:tiny,matter,particle
      energy!:power,force,transfer
      experiment:test,trial,method
      theory:explain,model,idea
      evidence:proof,fact,support
      element:basic,pure,matter
      molecule*:bond,atom,matter
      chemistry*:react,mix,matter
      physics*:force,law,matter
      evolution*:change,slow,life
      cell:tiny,life,unit
      discovery:find,new,reveal
    `,
  },
  {
    key: 'music',
    tier: 1,
    tags: ['music', 'sound', 'art', 'human', 'rhythm'],
    s: { co: 0.45, an: 0.3, sz: 0.35, hu: 0.95, na: 0.35, mo: 0.55, va: 0.82, it: 0.6, te: 0.35, tm: 0.75 },
    words: `
      song!:sing,melody,voice
      drum!:beat,rhythm,skin,strike
      guitar!:string,strum,wood
      piano!:key,hammer,string
      violin:string,bow,elegant
      melody:tune,line,sweet
      rhythm:beat,pulse,repeat
      chorus*:many,repeat,voice
      trumpet*:brass,bright,blow
      flute*:air,thin,sweet
      harmony:blend,agree,chord
      echo:repeat,fade,return
    `,
  },
  {
    key: 'sound',
    tier: 2,
    tags: ['sound', 'hear', 'signal', 'perception', 'event'],
    s: { co: 0.35, an: 0.25, sz: 0.4, hu: 0.6, na: 0.6, mo: 0.6, va: 0.5, it: 0.6, te: 0.2, tm: 0.85 },
    words: `
      noise:loud,mess,harsh
      hum*:low,steady,soft
      roar:loud,beast,fierce
      crack:sharp,break,sudden
      rustle*:soft,leaf,slight
      chime*:bright,ring,metal
      bang:sudden,loud,impact
      murmur*:low,many,soft
      ring:bell,clear,repeat
      click:small,sharp,precise
      creak*:old,wood,slow
    `,
  },
  {
    key: 'art',
    tier: 2,
    tags: ['art', 'create', 'human', 'beauty', 'craft'],
    s: { co: 0.5, an: 0.2, sz: 0.4, hu: 0.95, na: 0.25, mo: 0.25, va: 0.8, it: 0.5, te: 0.3, tm: 0.4 },
    words: `
      painting!:canvas,colour,image
      sculpture*:carve,form,stone
      drawing:line,pencil,sketch
      photograph:capture,light,moment
      theatre*:stage,act,audience
      dance!:move,rhythm,body
      novel*:book,long,story
      poetry:verse,image,rhythm
      film:screen,moving,story
      design:plan,form,intent
      colour:hue,paint,see
      canvas:cloth,blank,paint
    `,
  },
  {
    key: 'books',
    tier: 2,
    tags: ['knowledge', 'book', 'human', 'record', 'learn'],
    s: { co: 0.65, an: 0.05, sz: 0.28, hu: 0.9, na: 0.2, mo: 0.1, va: 0.72, it: 0.3, te: 0.3, tm: 0.25 },
    words: `
      book!:page,read,bind
      page:thin,leaf,turn
      ink:black,flow,mark
      pen:write,hold,line
      pencil:grey,sketch,wood
      paper!:thin,white,sheet
      chapter*:part,divide,story
      map!:place,guide,draw
      diary*:private,daily,record
      archive*:store,old,record
      dictionary*:word,define,order
    `,
  },
  {
    key: 'sport',
    tier: 1,
    tags: ['sport', 'game', 'play', 'human', 'compete'],
    s: { co: 0.6, an: 0.55, sz: 0.45, hu: 0.95, na: 0.3, mo: 0.9, va: 0.75, it: 0.75, te: 0.25, tm: 0.8 },
    words: `
      football!:kick,team,goal
      race!:speed,compete,finish
      goal:score,aim,net
      team:group,together,side
      match:contest,two,event
      ball:round,throw,bounce
      swimming:water,stroke,lap
      climbing:up,grip,height
      running:pace,stride,breathe
      boxing*:fist,ring,strike
      tennis*:racket,net,serve
      champion:best,win,crown
    `,
  },
  {
    key: 'games',
    tier: 2,
    tags: ['game', 'play', 'rule', 'human', 'chance'],
    s: { co: 0.55, an: 0.25, sz: 0.3, hu: 0.92, na: 0.15, mo: 0.4, va: 0.78, it: 0.5, te: 0.4, tm: 0.7 },
    words: `
      puzzle!:solve,piece,clue
      chess:board,strategy,king
      card:deck,suit,deal
      dice:roll,chance,cube
      riddle:ask,hidden,clever
      strategy:plan,long,think
      bluff*:false,hide,dare
      turn:order,alternate,move
      score:point,tally,rank
      board:flat,play,grid
      token:small,stand,piece
      trick*:clever,deceive,play
    `,
  },
  {
    key: 'war',
    tier: 2,
    tags: ['war', 'conflict', 'danger', 'force', 'human'],
    s: { co: 0.6, an: 0.4, sz: 0.7, hu: 0.9, na: 0.2, mo: 0.7, va: 0.12, it: 0.95, te: 0.55, tm: 0.75 },
    words: `
      war!:conflict,mass,destroy
      battle:clash,field,fight
      sword!:blade,steel,duel
      shield:defend,block,guard
      armour:protect,plate,heavy
      arrow:fly,point,bow
      cannon*:blast,iron,siege
      siege*:surround,wait,starve
      truce*:pause,peace,agree
      victory:win,end,triumph
      defeat:lose,end,fall
      army:many,order,march
      fortress*:stone,defend,strong
    `,
  },
  {
    key: 'law',
    tier: 2,
    tags: ['law', 'order', 'society', 'rule', 'human'],
    s: { co: 0.2, an: 0.25, sz: 0.55, hu: 0.98, na: 0.15, mo: 0.2, va: 0.5, it: 0.55, te: 0.25, tm: 0.55 },
    words: `
      law!:rule,bind,state
      justice!:fair,balance,right
      crime:break,wrong,punish
      judge:decide,court,weigh
      prison:lock,confine,punish
      trial:test,court,decide
      witness*:see,tell,truth
      verdict*:decide,final,announce
      contract*:agree,bind,sign
      right:claim,entitle,fair
      sentence*:decide,term,punish
      police:enforce,patrol,order
    `,
  },
  {
    key: 'money',
    tier: 2,
    tags: ['money', 'trade', 'value', 'society', 'human'],
    s: { co: 0.5, an: 0.1, sz: 0.45, hu: 0.95, na: 0.1, mo: 0.4, va: 0.55, it: 0.5, te: 0.5, tm: 0.5 },
    words: `
      money!:value,exchange,coin
      coin:metal,round,small
      debt*:owe,burden,future
      profit*:gain,surplus,trade
      auction*:bid,sell,rise
      wealth:much,rich,store
      price:cost,number,tag
      trade:swap,goods,route
      bank:store,vault,lend
      wage*:work,pay,regular
      tax*:state,take,rate
      treasure:hidden,gold,find
    `,
  },
  {
    key: 'time',
    tier: 1,
    tags: ['time', 'abstract', 'cycle', 'change', 'measure'],
    s: { co: 0.08, an: 0.1, sz: 0.6, hu: 0.7, na: 0.65, mo: 0.5, va: 0.55, it: 0.35, te: 0.2, tm: 1 },
    words: `
      time!:flow,measure,pass
      morning!:early,light,fresh
      night!:dark,quiet,sleep
      winter!:cold,bare,still
      summer!:warm,long,bright
      autumn:fall,colour,harvest
      spring:new,green,grow
      moment:brief,now,point
      century*:long,hundred,history
      dawn:first,pale,begin
      dusk*:last,fade,end
      future:ahead,unknown,coming
      past:behind,gone,memory
      clock:tick,face,measure
    `,
  },
  {
    key: 'motion',
    tier: 2,
    tags: ['motion', 'change', 'event', 'force', 'abstract'],
    s: { co: 0.3, an: 0.45, sz: 0.5, hu: 0.6, na: 0.6, mo: 1, va: 0.55, it: 0.6, te: 0.2, tm: 0.9 },
    words: `
      journey!:travel,long,change
      escape:flee,free,away
      chase:pursue,fast,after
      fall:down,gravity,sudden
      climb:up,effort,height
      drift:slow,current,aimless
      leap:jump,sudden,gap
      return:back,again,home
      arrival*:reach,end,greet
      departure*:leave,begin,away
      pursuit*:follow,want,long
      flight:away,fast,fear
    `,
  },
  {
    key: 'virtue',
    tier: 2,
    tags: ['abstract', 'value', 'character', 'human', 'moral'],
    s: { co: 0.03, an: 0.4, sz: 0.5, hu: 1, na: 0.4, mo: 0.2, va: 0.9, it: 0.55, te: 0.02, tm: 0.5 },
    words: `
      courage!:brave,face,fear
      honesty:true,plain,trust
      loyalty:stay,bond,faithful
      kindness:gentle,give,warm
      patience:wait,calm,endure
      mercy*:spare,forgive,soft
      humility*:small,modest,quiet
      freedom!:open,choose,unbound
      trust:rely,open,bond
      honour:respect,worth,duty
      generosity*:give,open,plenty
      dignity*:worth,upright,calm
    `,
  },
  {
    key: 'peril',
    tier: 2,
    tags: ['danger', 'abstract', 'threat', 'negative', 'event'],
    s: { co: 0.3, an: 0.35, sz: 0.6, hu: 0.7, na: 0.6, mo: 0.6, va: 0.1, it: 0.9, te: 0.25, tm: 0.8 },
    words: `
      danger!:threat,risk,near
      risk:chance,stake,uncertain
      trap:hidden,catch,spring
      poison:toxic,slow,kill
      disaster:sudden,ruin,mass
      collapse*:fall,fail,sudden
      threat:warn,coming,harm
      wreck*:ruin,broken,remain
      chaos:disorder,wild,unpredict
      ruin:decay,end,broken
      plague*:spread,illness,mass
      famine*:hunger,lack,mass
    `,
  },
  {
    key: 'myth',
    tier: 2,
    tags: ['myth', 'legend', 'story', 'sacred', 'imagination'],
    s: { co: 0.35, an: 0.6, sz: 0.7, hu: 0.8, na: 0.5, mo: 0.45, va: 0.6, it: 0.75, te: 0.05, tm: 0.4 },
    words: `
      dragon!:fire,scale,legend,huge
      ghost!:dead,pale,haunt
      witch*:spell,craft,fear
      wizard*:spell,staff,wise
      curse*:doom,word,bind
      spirit:unseen,breath,soul
      prophecy*:future,foretell,fate
      ritual*:repeat,sacred,form
      temple:sacred,stone,worship
      angel*:wing,light,divine
      demon*:dark,evil,tempt
      oracle*:speak,future,riddle
      legend:old,told,famous
    `,
  },
  {
    key: 'sacred',
    tier: 3,
    tags: ['sacred', 'faith', 'abstract', 'human', 'meaning'],
    s: { co: 0.12, an: 0.4, sz: 0.7, hu: 0.92, na: 0.45, mo: 0.2, va: 0.75, it: 0.6, te: 0.02, tm: 0.4 },
    words: `
      faith:believe,hold,unseen
      prayer:ask,quiet,devote
      soul:inner,eternal,self
      heaven:above,perfect,eternal
      sin:wrong,fall,guilt
      blessing:give,favour,grace
      pilgrim:travel,devote,far
      sacrifice:give,cost,offer
      eternity:endless,time,vast
      grace:gift,gentle,unearned
      destiny:fate,path,written
    `,
  },
  {
    key: 'learning',
    tier: 2,
    tags: ['learn', 'knowledge', 'school', 'human', 'growth'],
    s: { co: 0.25, an: 0.4, sz: 0.45, hu: 0.95, na: 0.3, mo: 0.3, va: 0.72, it: 0.4, te: 0.4, tm: 0.55 },
    words: `
      lesson:teach,unit,learn
      practice:repeat,skill,improve
      mistake:wrong,learn,slip
      skill:able,honed,craft
      exam*:test,pressure,grade
      student:learn,young,study
      knowledge:know,store,true
      training*:repeat,build,ready
      talent:gift,natural,ease
      progress:forward,better,slow
      failure:not,end,learn
      mastery*:complete,deep,skill
    `,
  },
  {
    key: 'travel',
    tier: 2,
    tags: ['travel', 'place', 'move', 'human', 'away'],
    s: { co: 0.55, an: 0.35, sz: 0.6, hu: 0.85, na: 0.45, mo: 0.85, va: 0.72, it: 0.5, te: 0.45, tm: 0.7 },
    words: `
      road!:long,path,travel
      path:narrow,walk,lead
      crossroads*:choice,meet,four
      border*:line,divide,cross
      compass:point,north,guide
      luggage*:carry,pack,heavy
      passport*:allow,identity,cross
      hotel*:stay,night,room
      trail*:track,wild,follow
      voyage*:long,sea,far
      tourist*:visit,camera,brief
      home!:return,belong,warm
    `,
  },
  {
    key: 'containers',
    tier: 2,
    tags: ['object', 'container', 'made', 'hold', 'store'],
    s: { co: 0.97, an: 0.02, sz: 0.35, hu: 0.75, na: 0.2, mo: 0.1, va: 0.55, it: 0.15, te: 0.25, tm: 0.05 },
    words: `
      box!:square,hold,lid
      bag:carry,soft,open
      bottle:neck,glass,liquid
      basket:weave,open,carry
      barrel*:round,wood,store
      chest*:heavy,lid,treasure
      crate*:wood,ship,stack
      sack*:coarse,grain,heavy
      envelope*:paper,seal,letter
      vault*:secure,thick,bank
      bucket:handle,water,carry
      pocket:small,cloth,hide
    `,
  },
  {
    key: 'quality',
    tier: 3,
    tags: ['quality', 'abstract', 'property', 'perception'],
    s: { co: 0.15, an: 0.2, sz: 0.45, hu: 0.6, na: 0.55, mo: 0.3, va: 0.55, it: 0.45, te: 0.2, tm: 0.25 },
    words: `
      stillness*:motionless,calm,quiet
      weight:heavy,mass,press
      texture:surface,feel,grain
      balance:even,poise,steady
      symmetry:mirror,even,order
      contrast:differ,edge,compare
      depth:down,far,deep
      clarity:clear,sharp,plain
      simplicity*:plain,few,clear
      order:arrange,rule,neat
      scale:size,relative,measure
      distance:far,gap,between
    `,
  },
];
