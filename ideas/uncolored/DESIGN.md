# Uncolored (未上色)

**Status:** prototype
**Created:** 2026-10-28
**Play:** https://fyh828.github.io/protos/ideas/uncolored/
**Pitch:** Explore a blank pencil-sketch world, paint each doodle its true color so you can pick it up, then pack your finds into a picky creature's bag to earn keys that open more of the map.

## The idea

The whole world is an unfinished sketch on white paper. Every object in it is a wobbly, slightly moving pencil doodle with no color. The player has no character; they simply look around the page by moving the mouse toward the screen edge or dragging the page, like panning across a giant drawing.

To take anything, the player must first give it its *correct* color. A doodle of a banana only becomes a real banana once it is painted yellow. When a doodle is fully painted it "settles": the lines stop wobbling and redraw themselves as a cleaner, finished drawing. If the color is right, the edge also starts to glow, and only then can it be clicked and put in the backpack. White objects (a snowman) are already correct on blank paper and can be taken straight away.

The player starts with no paint. Red, yellow and blue paint pots are hidden around the map, and secondary colors come from layering primaries on the same object (red + yellow = orange, and so on). Seeing a line drawing and knowing "that one is a basketball, so I need orange, so I need both red and yellow" is the core deduction. Each of the eight colors has exactly one object type chosen so the color is obvious from the outline alone.

A creature near the start carries an empty bag shown as a flat 2D outline. It keeps asking the player to fill it. The player drags collected objects onto the outline until it is covered; the creature takes the objects that were used and pays out keys. Keys remove the fog from more of the map, where the same kinds of objects appear again, but larger the farther they are from the start. Bigger objects cover more of a bag, so exploring pays off, but every object handed over is gone, which makes "which pieces should I spend on this bag?" a small resource puzzle.

The fantasy is bringing a drawing to life one stroke at a time. Compared with a normal coloring book, color here is a key: it is how you prove you recognised a thing, and it is what turns scenery into something you can own.

## Core loop

1. Pan around the unlocked part of the map and spot doodles you can now color.
2. Pick a paint, scribble over the doodle until it settles (about 2 seconds for a start-region object, up to about 10 seconds for the biggest ones; mix a second color on top for orange, green or purple).
3. If it glows, put the brush down and click it to collect it.
4. When you have enough, open the creature's bag and drag items over its outline.
5. Fill the bag, receive keys, spend them on fogged map regions, find the next paint and bigger objects.

One painting-and-collecting loop is 10 to 30 seconds. One bag round is about 3 to 6 minutes. A full game is 4 rounds, roughly 15 to 25 minutes.

## Rules and systems

### Map and regions

- The map is a 3 by 3 grid of regions. Each region is 2400 by 1600 world units (the screen shows roughly 1600 by 900 units at a time, so every region needs scrolling to see in full).
- Regions, with the theme of their scenery: top row Vineyard, Clouds, Summit; middle row Pond, Town, Hills; bottom row Meadow (start), Beach, Desert.
- The game starts with the view in the bottom-left corner of the bottom-left region (Meadow). Only that region is unlocked.
- A locked region is covered by fog. The camera may look about 260 units (sideways) or 200 units (up/down) into the fog, never further, and never past the outer edge of the map.
- When a locked region next to an unlocked one is in view, an unlock button sits on the fog: "unlock this area, costs 1 key". Clicking it with at least one key spends a key and clears the fog. Only regions sharing an edge with an unlocked region can be unlocked.
- There are 8 locked regions but the game hands out only 6 keys, so 2 regions always stay fogged. Choosing the order is part of the strategy.

### Objects and their colors

There are eight object types, one per color:

| Color  | How to make it          | Object      |
|--------|-------------------------|-------------|
| Red    | red                     | Strawberry  |
| Yellow | yellow                  | Banana      |
| Blue   | blue                    | Water drop  |
| Orange | red + yellow            | Basketball  |
| Green  | yellow + blue           | Cactus      |
| Purple | red + blue              | Grapes      |
| Black  | red + yellow + blue     | Top hat     |
| White  | no paint at all         | Snowman     |

- **Size:** an object's size depends only on its distance from the start corner. Measuring distance in region units (horizontal distance / 2400, vertical distance / 1600), size = 0.8 + 0.4 x distance. Objects in the start region are about 1x, objects in the far top-right corner about 2.4x as wide (almost 6x the area).
- **Paint coverage:** think of each object as covered by a fine grid of small squares. Each square holds an amount of paint from 0 to 1 and remembers which primaries touched it. A square counts as painted at 0.8 or more.
- **Mixing:** an object has one color at a time, the mix of every primary currently on it. A primary counts once it is on at least 3% of the object's squares (so a stray speck does not spoil a neighbour). If nothing has reached 3% yet, the most-used primary is shown.
- **Settling:** when 90% of an object's squares are painted, the rest fills in instantly and the object "settles": its lines stop wobbling and it is redrawn as a cleaner drawing in its mixed color. It stays settled until erasing brings it back under 90%.
- **Blank:** an object with paint on 4% or less of its squares counts as blank, which means white.
- **Correct:** an object is correct when it is settled and its mixed color matches its type, or when it is a snowman and blank. Correct objects glow at the edge. Only correct objects can be collected.
- Adding a primary to a settled object changes its color but keeps it settled. A settled yellow banana brushed with some blue turns into a settled green banana, which is wrong.

### Paint, brush and eraser

- Red, yellow and blue paint pots lie on the map. Clicking a pot unlocks that paint for the rest of the game.
- The eraser is available from the start.
- Choosing a paint or the eraser turns the cursor into that tool. Holding the left button paints; releasing lifts the brush. Right-click puts the tool away and restores the normal cursor.
- **Brush:** radius 22 units. It is a dry brush: one pass over an area adds about a quarter of a full coat, so a spot needs about four passes. This is deliberate, so that sweeping the brush across the whole map is slow and pointless.
- **Eraser:** radius 46 units, and one or two passes remove all paint. Erased squares forget which primaries they had.
- **Paper does not hold paint.** Brush marks on empty paper or scenery fade within about a second. Paint only stays on objects.
- Objects can only be collected with the normal cursor (tool put away).

### Backpack

- Clicking a correct object with the normal cursor moves it into the backpack. The backpack has no size limit. Its contents are shown in the creature's window.

### The creature and its bag

- A creature stands at the bottom-left of the map. It always says: "收集地图上的东西，填满我的背包，获得奖励" (collect things from the map, fill my bag, get a reward). Clicking it opens its window.
- The window shows the creature's current bag as a closed 2D outline, and the player's backpack as a tray.
- Items are drawn at their true size, at the same scale as the bag. Drag an item from the tray onto the bag area to place it. Placed items may overlap each other and may hang over the edge of the outline. Placed items can be dragged again, rotated in 15-degree steps, or dropped back on the tray.
- The window shows how much of the outline is covered. The moment 98% or more is covered, the creature takes every placed item that touches the outline, returns any placed item that does not, and pays the reward. The next, larger bag appears.
- Closing the window before the bag is full returns every placed item to the backpack.
- Bags and rewards, in order. Areas are in square world units; for comparison a start-region snowman covers about 3,300 and a start-region strawberry about 7,000, while the biggest top-right objects reach about 30,000:

| Round | Bag         | Area    | Reward  |
|-------|-------------|---------|---------|
| 1     | Pouch       | ~8,000  | 1 key   |
| 2     | Satchel     | ~16,000 | 2 keys  |
| 3     | Backpack    | ~30,000 | 3 keys  |
| 4     | Giant sack  | ~55,000 | Trophy  |

### Level layout

Paint locations and object counts per region. Distances grow toward the top-right, so objects there are the biggest.

| Region            | Paint  | Objects (color)                                                         |
|-------------------|--------|-------------------------------------------------------------------------|
| Meadow (start)    | Red    | 3 snowman (white), 4 strawberry (red), 1 cactus (green, a teaser)       |
| Beach             | Yellow | 2 banana, 2 basketball, 1 strawberry, 1 snowman, 1 water drop, 1 cactus |
| Pond              | Blue   | 2 water drop, 2 grapes, 1 strawberry, 1 snowman, 1 banana, 1 top hat    |
| Town (center)     | none   | 2 cactus, 1 top hat, 1 grapes, 1 basketball, 1 banana, 1 water drop     |
| Desert            | none   | 2 cactus, 2 basketball, 1 banana, 1 top hat, 1 strawberry               |
| Vineyard          | none   | 2 grapes, 2 water drop, 1 top hat, 1 cactus, 1 snowman                  |
| Hills             | none   | 2 top hat, 1 cactus, 1 basketball, 1 banana, 1 grapes                   |
| Clouds            | none   | 1 top hat, 1 water drop, 1 grapes, 1 cactus, 1 strawberry, 1 snowman    |
| Summit            | none   | 1 top hat, 1 cactus, 1 basketball, 1 grapes, 1 banana, 1 water drop     |

Design intent behind the layout:

- The first view shows the creature and two snowmen, so the player can collect something within seconds. The red pot sits just past the right edge of the first view, so it is found by looking around, not handed over.
- The start region is mostly white and red, which is all the player can make there. It has one green cactus as a teaser and nothing else out of reach.
- The first key buys Beach (yellow: bananas, basketballs) or Pond (blue: water drops, grapes). Either works for bag 2. The second reward (2 keys) lets the player fetch the other primary, after which green and black become possible.
- Every bag can be filled from the regions reachable at that point with room to spare, so a careless player wastes items but cannot get stuck. This was checked with a simple solver for both first-key choices. Preferring small items, it used 4 of the 7 start items for bag 1, 4 to 6 of the 9 items on hand for bag 2, 9 to 11 of 21 or more for bag 3, and 11 of 32 for bag 4. A player using bigger items needs fewer.

## Controls

Supported in the prototype (desktop, mouse and keyboard):

- **Look around, edge band:** move the mouse into the band about 100 px wide along any screen edge. The view starts drifting at the inner side of the band and speeds up toward the edge. While painting, only the outermost 30 px scroll, so strokes near the edge do not move the view. Hovering the HUD or an unlock button never scrolls.
- **Look around, drag:** with no tool in hand, hold the left button on the map and drag. The right or middle button drags the map at any time, also while holding a tool. A drag released while still moving glides on briefly.
- **Look around, keys:** arrow keys or WASD.
- **Left click** (press and release without dragging): pick up a paint pot, collect a glowing object, talk to the creature, press fog unlock buttons.
- **1 / 2 / 3 or clicking the paint slots (top left):** take red / yellow / blue paint. **E** or the eraser slot: take the eraser.
- **Hold left button with a tool:** paint or erase. **Right-click without dragging** (or Esc): put the tool away.
- **In the creature's window:** drag items from the tray onto the bag; drag them back to the tray to remove; mouse wheel or R rotates the item being dragged or hovered; right-click a placed item to send it back; Esc or the close button closes the window and returns placed items.
- **M:** mute sound.

Touch is not supported.

## Win, lose, and progression

- Filling the fourth bag gives the trophy and wins the game. A results card shows play time, items handed over and regions unlocked.
- There is no losing state. Progress is not saved between sessions; reloading starts over.
- Within a session, progression is: paints found, regions unlocked, keys earned. Objects handed to the creature are gone for good.

## Look and sound

- **Visual style:** warm off-white paper with a light grain. Interactive objects are drawn in dark pencil that wobbles continuously and is slightly unfinished (doubled strokes, small gaps). Background scenery (grass, waves, dunes, hills, clouds) uses thin, light-gray, still lines so it never reads as collectible.
- **Painted objects:** paint has a dry-brush, streaky texture until the object settles, then fills solid with soft shading, clean outlines and small highlights. Correct objects pulse with a golden edge glow.
- **Colour palette:** muted crayon tones: red #e0453a, yellow #f2c230, blue #3a78d8, orange #f08a2c, green #4caf50, purple #8e4fc2, black #2a2a2e, white #ffffff.
- **Fog:** cool grey fog over locked regions, with drifting white puffs and a sketched, scalloped cloud edge where it meets open land.
- **Sound direction:** quiet, tactile, stationery sounds: pencil scratch while painting, soft pop on pickup, bell chime when an object turns correct, small fanfare for a filled bag.
- **Placeholders:** all art is drawn in code (no image files). All sounds are simple synthesized placeholders. Every asset is a placeholder.

## Prototype scope

The prototype should answer: is "recognise the doodle, work out its color, paint it, then spend your finds on a covering puzzle" fun enough to carry a session, and does the dry brush keep painting deliberate without being tedious?

**In the prototype**

- Full 3 by 3 map with fog, edge scrolling and key-based unlocking.
- All eight object types, three paints, the eraser, color mixing, settling and the correct-color glow.
- Size scaling by distance and the full level layout above.
- The creature with four bags, drag, rotate and coverage check, keys and trophy.
- Start screen with controls, on-screen hints, synthesized sound, win screen.

**Deliberately left out**

- Saving and loading.
- More than one creature, other quest givers, or rewards other than keys and the trophy.
- Hand-drawn art, music, animation beyond procedural wobble and simple pops.
- Touch controls, settings, accessibility options (except mute).
- A separate backpack screen outside the creature's window.

## Open questions

- **White objects:** right now snowmen are correct on blank paper and free from the start. Alternative: they must be "cleaned" with the eraser before they can be taken, which would make the eraser part of the puzzle rather than only a fix-up tool.
- **Paint on paper:** brush marks on empty paper fade. Alternative: paper keeps a faint permanent stain, which feels more like painting the world but can make the map messy.
- **Mixing precision:** an object mixes every primary on more than 3% of its area. Should mixing need the colors to overlap on the same spot instead, which is more painterly but slower?
- **Key economy:** 6 keys for 8 regions forces a choice. Should there be enough keys to open everything, or more creatures with their own bags?
- **Bag check:** the bag is accepted automatically at 98%. Alternative: a "hand over" button, which lets players optimise which items they spend but adds a step.
- **Overhang:** items may hang outside the outline. Requiring items to stay inside would turn the bag into a stricter packing puzzle.
- **Language:** the prototype shows Chinese text with short English subtitles. Pick one for a real build.

## Playtest notes

- 2026-10-28, Yuheng (designer), first play of the prototype. Liked it overall. Edge scrolling only reacted when the mouse was pressed right against the screen edge, which felt too strict. Asked for dragging the map as a second way to move. Both changed the same day (see changelog).

## Changelog

- 2026-10-28: Wider edge-scroll band (100 px, speed ramps up toward the edge; 30 px while painting; never over HUD buttons). Added drag-to-pan: left-drag with no tool, right- or middle-drag any time, with a short glide. Clicks now act on release without dragging.

- 2026-10-28: First prototype: map, fog and keys, paints and eraser, color mixing, eight object types, the creature's four bags, win screen. Design doc created.
