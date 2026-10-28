# Color Chorus (有声有色)

**Status:** prototype
**Created:** 2026-10-28
**Play:** https://fyh828.github.io/protos/ideas/color-chorus/
**Pitch:** Lead a tiny choir of red, yellow and blue singers through a stage show: their songs dye uncolored props, overlapping songs mix the colors, and a scene is won when every prop shows its true color at the same moment.

## The idea

The game is a side-view stage show in five scenes. Each scene is a painted backdrop with a few floating platforms and some props drawn as plain line art: a strawberry, a banana, a top hat. The player leads a little choir of two to four singers who stand side by side on the stage floor. Only one singer is controlled at a time; the number keys switch between them, and the others wait where they were left.

Singing is how the world gets its color. A singer sings when the player switches to it and whenever it lands after a jump or a fall. A song is a set of rings that grow out of the singer, and any prop a ring touches takes the singer's color for a while. Each singer has one color (red, yellow or blue) and a range that grows with its body size: a big singer's song reaches far, a small one's stays close. Props that receive two or three colors at once mix them (red and yellow make orange, all three make black), so painting a basketball orange means letting a red song and a yellow song overlap on it while keeping them away from the banana next to it.

Every prop has one obvious true color that the player has to recognise from the line art alone (a basketball is orange, a cactus is green, a top hat is black). Colors fade after ten seconds, so a scene cannot be painted one prop at a time over several minutes. The player has to plan where every singer should stand, walk them there, and then switch through them quickly so they all sing together. The scene is won the instant every prop is correct. Getting there feels like conducting: you set the choir in position, and the final chord makes the whole picture appear in color.

What makes it different from a usual color-mixing puzzle is that the brush is a circle you cannot shape. Where a singer can stand is limited by the platforms, how far its song reaches is fixed by its size, and every song colors everything in range. The challenge is to find spots where the overlapping circles hit exactly the right props and nothing else. Mistakes are never permanent, because colors wash out by themselves.

Between scenes there is no menu or "next" button. When a scene is won, a GO arrow appears; holding the right arrow key gathers the choir at the right edge of the stage and walks it into the next scene as the backdrop slides away like a slide in a deck. On arrival some singers wave goodbye and hop off the stage into the orchestra pit, and new ones hop up to join. Beyond this prototype, the idea has room for scenes with walls that block sound, echoes, props that move, singers who can stand on each other, and longer songs bought with stamina.

## Core loop

1. Look at the props and work out each one's true color, then which primaries it needs.
2. Pick a singer (number key; it sings where it stands) and walk or jump it to a spot whose range circle covers the right props. Landing there makes it sing.
3. Repeat for the other singers; the colors from the first songs may fade while you do this.
4. Switch through the singers quickly (1, 2, 3, 4) so their songs overlap in time, and watch every prop turn its true color at once.
5. Hold → to walk on to the next scene, where the choir changes.

One attempt at a scene takes 10 to 40 seconds. A scene usually takes 1 to 4 minutes. The whole prototype takes about 10 to 15 minutes.

## Rules and systems

### Stage and movement

- The stage is 1280 by 720 units with y pointing down. The stage floor (the bottom platform) runs the full width with its top at y = 620. It is solid; nobody can fall off it, and the left and right edges of the screen are walls during play.
- Floating platforms are one-way ledges given as [x from, x to, height]. A singer can jump up through them from below and stands on them from above. Pressing ↓ on a ledge drops through it.
- All singers walk at 250 units per second and jump the same way: up to about 168 units high, with full steering in the air. Ledges sit at heights 490, 360 and 230 (one branch at 480), so each step up is at most 140 units and always within reach. Sideways, a jump crosses about 180 units at the same height, or about 130 units while going up a step. Every ledge in the five scenes is within those distances. There is no fall damage and no way to get stuck.
- Singers do not collide with each other or with props. Two singers can stand in the same place.
- A singer stands on a ledge as long as its centre is within a quarter of its body width of the ledge's span, so it can stand slightly past either end.
- Only the active singer moves. The others stand still. If a singer was in the air when you switched away from it, it still falls and lands.

### Singers

| Size   | Body (w × h) | Song range | Reach to a prop's centre |
|--------|--------------|------------|--------------------------|
| Small  | 40 × 42      | 140        | 166                      |
| Medium | 54 × 57      | 189        | 215                      |
| Big    | 80 × 76      | 252        | 278                      |

The song range is proportional to body size (range = 140 × size factor 1, 1.35 or 1.8). "Reach" is range plus the prop's radius, explained under Songs.

The choir, named after the notes they sing:

| Singer | Color  | Size   | Note | Look          |
|--------|--------|--------|------|---------------|
| 哆 Do   | Red    | Medium | C4   | Bow tie       |
| 来 Re   | Yellow | Small  | D5   | Hair tuft     |
| 咪 Mi   | Blue   | Medium | E4   | Headphones    |
| 发 Fa   | Red    | Big    | F3   | Moustache     |
| 嗦 Sol  | Blue   | Small  | G5   | Knitted beanie |
| 拉 La   | Yellow | Big    | A3   | Scarf         |

### Songs

- **When a singer sings:** (1) when the player switches to it, or presses its number again while it is already active, as long as it is standing on something; (2) whenever any singer, active or not, lands on a floor or ledge after being in the air (jump, walk-off or drop-through). A singer switched to in mid-air sings when it lands.
- **What a song is:** for up to 5 seconds, the singer sends out a ring every 0.5 seconds, starting at once. Each ring starts at the singer's body centre (feet height minus half its body height) and grows to the singer's full range in 1.1 seconds, then fades.
- **Moving ends a song.** If the singer walks, jumps or falls, it sends no more rings. Sliding up to 8 units while coming to a stop does not count. Rings already sent keep growing from where they started. A new song (another switch or landing) restarts the 5 seconds. Because the first ring leaves at once, every song reaches its full circle at least once, even if the singer walks off straight away.
- **Songs carry on after you switch away**, because standby singers stand still. Several singers can sing at once.
- **Touching a prop:** a ring touches a prop when its radius comes within 26 units of the prop's centre. In other words, a singer standing still reaches every prop whose centre is no farther than range + 26 from its body centre (the Reach column above). Each ring touches each prop once.
- The active singer shows its range as a dashed circle, and props inside it get a small marker, so the player can line up a spot before singing.

### Dye and mixing

- When a ring of color C touches a prop, the prop holds C for the next 10 seconds. Another touch of C resets that color's timer to 10 seconds. So a singer that stands and sings for the full 5 seconds keeps its colors fresh, and they last until 10 seconds after the song ends.
- A prop's current color is the mix of the primaries it holds right now: red + yellow = orange, yellow + blue = green, red + blue = purple, all three = black. Holding none, a prop is blank line art.
- When a primary's timer runs out it simply drops out of the mix, so a black hat whose red runs out turns green.
- Each prop type has one true color:

| Prop       | True color | Needs               |
|------------|------------|---------------------|
| Strawberry | Red        | red                 |
| Banana     | Yellow     | yellow              |
| Water drop | Blue       | blue                |
| Basketball | Orange     | red + yellow        |
| Cactus     | Green      | yellow + blue       |
| Grapes     | Purple     | red + blue          |
| Top hat    | Black      | red + yellow + blue |

  The true color is never shown; recognising the prop is part of the puzzle. There is no white prop (blank is never correct).
- A prop is correct while its current color equals its true color. Correct props glow gold.

### Winning a scene

- The moment every prop in the scene is correct at the same time, the scene is won. All colors freeze for good, songs stop sending rings, the audience cheers, and after about a second a GO arrow appears on the right.
- **R** restarts the scene during play: the singers go back to their starting line-up and all colors are cleared.

### Between scenes

1. After the GO arrow appears, pressing and holding → makes every singer head for a line-up on the right end of the stage floor, in key order from left to right. Singers on ledges hop down through them; singers on the floor walk. The press must come after the arrow appears; holding → from before the win does nothing, so a player who was walking right does not leave by accident.
2. Releasing →, or pressing any other key while holding it, pauses this; it resumes when → is held alone again. Nothing else can be done in this phase (no switching, jumping or restarting; only M for mute still works). Singers caught in mid-air finish their fall.
3. When everyone stands in the line-up while → is held, the choir walks right together and the backdrop slides left, bringing in the next scene like the next slide in a deck. This takes about 1.7 seconds. It always finishes once started, even if → is released.
4. In the new scene, singers who are not in its cast wave and hop off the front of the stage into the orchestra pit; staying singers step to their new places; newcomers hop up from the pit into the line-up. Then play begins with key 1 active. Keys 1–4 always follow the line-up from left to right, so a singer's number can change between scenes.

### Levels

Starting line-up for every scene: singers stand on the floor from x = 60 rightward in cast order, with 26 units between bodies. Item positions are prop centres. The solutions below were checked with a small solver that tries every standing spot for every singer.

**Scene 1: Garden 花园.** Cast: Do. Ledges: [640–840] at 490, [900–1120] at 360. Props: three strawberries at (520, 586) on the floor, (250, 400) hanging from a branch, (1040, 326) on the high ledge. *Teaches walking, jumping, singing and fading.* Do can catch both low strawberries from the floor at x 307–347 and the high one from the upper ledge, or sing at each strawberry in turn within the 10 seconds.

**Scene 2: Picnic 野餐.** Cast: Do, Re (new). Ledges: [150–330] at 480 (a tree branch), [820–1020] at 490 (a picnic table). Props: strawberry (560, 586) on a blanket, basketball (760, 400) in a hoop, banana (900, 456) in a basket on the table. *Teaches mixing: orange = red + yellow.* Red must reach the strawberry and the ball but not the banana: Do on the floor at x 663–733. Standing right under the hoop also reaches the banana, which is the usual first mistake. Small Re cannot reach the ball from the floor and must sing from the table at x 810–910.

**Scene 3: Greenhouse 温室.** Cast: Do, Re, Mi (new). Ledges: [200–360] at 490, [250–430] at 360, [560–720] at 360, [760–920] at 490. Props: grapes (460, 280) hanging from a vine, water drop (820, 280) dripping from a pipe, cactus (780, 456) in a pot on the right shelf, banana (600, 586) in a crate. *Teaches green and purple, and finding the one spot that reaches three props.* Mi must sing from the top middle ledge at x 613–667 to reach the grapes, drop and cactus but not the banana (or use two songs). Do reaches only the grapes from the upper left ledge. Re reaches the cactus and banana from the floor at x 696–764.

**Scene 4: Magic Stage 魔术舞台.** Cast: Re, Mi, Fa (new), Sol (new); Do leaves. Ledges: [220–380] at 490, [400–560] at 360, [580–700] at 230, [740–880] at 360, [920–1080] at 490. Props: top hat (640, 196) on the top ledge, basketball (500, 326), strawberry (300, 330) on a wire, grapes (800, 326), water drop (1000, 456). *Teaches black, big versus small singers, and singing as a chord.* Big Fa reaches all four red props from the upper left ledge at x 524–576. Re must climb to the top ledge at x 570–616 to reach the hat and ball without the strawberry or grapes. No single blue spot reaches the hat, grapes and drop at once, so the two blues split the work. For example, Mi on the top ledge at x 677–713 does the hat and grapes while Sol does the drop. The climbs take longer than 10 seconds in total, so the intended finish is to place everyone and then press 1 2 3 4 quickly.

**Scene 5: Night Market 夜市.** Cast: La (new), Do (returns), Mi, Sol; Re and Fa leave. Ledges: [240–380] at 490, [420–580] at 360, [720–900] at 360, [940–1080] at 490. Props, hanging as lanterns except the water drop: top hat (640, 330), basketball (640, 200), grapes (420, 450), cactus (860, 450), strawberry (330, 260), banana (950, 260), and the water drop (560, 586) in a crate on the floor. *The finale: one prop of each color, arranged like a three-circle Venn diagram.* Do on the left ledge at x 471–531 reaches exactly the four red props, and La on the right ledge at x 700–888 the four yellow ones. Blue is the twist: the grapes and the cactus are too far apart for one blue circle, and Mi cannot reach the hat without also reaching the basketball. So small Sol must take the hat plus one side (right ledge x 738–804 for hat + cactus, or left ledge x 476–542 for hat + grapes), and Mi takes the other side and the drop from the floor (x 347–581 for grapes + drop, or x 699–773 for cactus + drop). All four must sing together.

After scene 5, the choir walks on to a curtain-call scene where the two singers who left earlier hop back up and everyone sings a final chord. This is the ending.

## Controls

Supported in the prototype (desktop keyboard; mouse optional):

- **← / →** (or A / D): walk the active singer.
- **Space** (or ↑ / W): jump.
- **↓** (or S): drop down through a ledge.
- **1 2 3 4**: switch to that singer, which sings at once. Pressing the active singer's number makes it sing again. Clicking a singer's card in the top bar does the same.
- **R**: restart the scene.
- **M**: mute or unmute.
- **After a win:** hold **→** to walk on. Releasing it or pressing other keys only pauses.
- **Start screen:** any key or click starts (and enables sound).
- **Testing aid:** adding `?level=3` to the URL starts at scene 3.

Touch is not supported.

## Win, lose, and progression

- Each scene is won by having every prop correct at the same moment. There is no losing and no timer beyond the fading colors; a bad attempt fixes itself as colors wash out, or R restarts the scene.
- The choir changes from scene to scene as listed above. Nothing else carries over.
- After scene 5 the curtain-call scene ends the show; R starts again from scene 1. Progress is not saved; reloading starts over.

## Look and sound

- **Framing:** the whole game is a stage show. The stage floor is a warm wooden board that runs through every scene, with an orchestra pit and a row of audience silhouettes below it that cheer when a scene is won. Each scene is a painted backdrop that slides in from the right.
- **Backdrops:** soft, flat, colorful scenery with a light paper grain and small ambient animation: a morning garden with a fence and a tree, a sunny park with clouds, a glass greenhouse with steam, a magic stage with curtains and moving spotlights, and a night market with string lights and stars. The backdrops are deliberately muted pastels so the dyed props stand out.
- **Props:** dark-ink line art on white until dyed. Dyed props get flat saturated color with soft shading and highlights. Correct props pulse with a gold glow. Colored pips under a prop show which primaries it holds and how much time each has left, blinking in the last seconds.
- **Singers:** round jelly-like blobs in strong primaries (red #e0453a, yellow #f2c230, blue #3a78d8) with big eyes, a small accessory each, and squash and stretch on jumps and landings. While singing, the mouth opens on every ring and small music notes float up.
- **Rings:** thick soft strokes in the singer's color with a faint fill, fading as they grow.
- **Sound:** every singer sings its own note, one soft vocal tone per ring, with big singers an octave lower, so a chord of singers sounds like a chord. Also a soft jump blip, a little "plip" when a prop gains a color, a chime when a prop turns correct, a fanfare and applause for a won scene, and hop sounds for singers joining and leaving.
- **Placeholders:** everything is drawn in code and every sound is synthesized. All art and audio are placeholders for style exploration; the prop shapes are adapted from the Uncolored prototype's line art.

## Prototype scope

The prototype should answer: is "place the singers, then sing a chord so overlapping circles give every prop its true color" a satisfying puzzle? And are the starting numbers (5-second songs, 10-second colors, range tied to size) the right ones?

**In the prototype**

- Five scenes and the curtain call, six singers, all seven prop types.
- Movement with one-way ledges, songs, rings, dye with fading and mixing, the range preview.
- The full scene-to-scene flow: GO arrow, hold-to-gather, slide, singers hopping off and on.
- Start screen with controls, on-screen hints per scene, HUD with singer cards and the correct-prop counter, synthesized sound, restart and mute.

**Deliberately left out**

- Saving, a level select (only the `?level=` testing aid), settings.
- Sound-blocking walls, moving props, singers standing on each other, any enemies or failure states.
- Hand-drawn art, music beyond the singers' notes, touch controls.

## Open questions

- **Moving while singing:** moving currently ends the song. Alternatives: the song follows the singer as it walks (a moving brush, much more powerful), or it keeps ringing from the spot where it started.
- **Timing:** are 5-second songs and 10-second colors right? Shorter colors make the chord tighter; longer ones let players paint scenes one prop at a time.
- **Range preview:** the dashed circle and markers make spots easy to find. Without them the game becomes guessing distances. Maybe show the circle but not the markers?
- **Re-singing:** pressing the active singer's key makes it sing again. Alternative: only a jump in place re-sings, which makes position changes cost more.
- **Falling counts as landing:** walking off a ledge also sings when you land. Alternative: only jumps do, so a singer can come down quietly.
- **Size and jumping:** all sizes jump the same. Big singers could jump lower, making "big range but stuck low" a real trade-off.
- **Lock-in:** props only freeze when the whole scene is correct. Alternative: a prop locks as soon as it is correct, which removes the chord and the timing entirely.
- **Hit test:** touching is measured to the prop's centre with a fixed 26-unit radius. The drawn outline would be more exact but harder to predict.
- **Language:** the prototype shows Chinese with short English subtitles. Pick one for a real build.

## Playtest notes

- 2026-10-28, Yuheng (designer), first play of the prototype. Liked it; no changes requested.

## Changelog

- 2026-10-28: First prototype: five scenes and a curtain call, six singers, songs and rings, dye with fading and mixing, range preview, scene-to-scene walk with sliding backdrops and singers joining and leaving. Design doc created.
