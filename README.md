# Borderline
Guess the year from geopolitical, religous and cultural maps. 
<img width="1402" height="385" alt="image" src="https://github.com/user-attachments/assets/387a63bf-f056-4c0f-840b-16d2ec02f13a" />

## Description
I used to play a game called MapGuessr, which was a game where you are given the geopolitical border of a year between 3000 BC to 2000 CE, and you have to guess the year. The website got abruptly shutdown, so I decided to make my own clone. Of course, with my own personal revamps and additions as my creative juices compelled me to.

## Features
There are many features, many of whom are adopted directly from MapGuessr, and many of which is revamps to old features or additions by me

### Main Game
<img width="1918" height="922" alt="image" src="https://github.com/user-attachments/assets/5c40bf95-9c2b-44a0-a49a-bd684a3cd072" />
The main game features a top bar to customize the map, as well as features on it. It also includes a information panel on the top right that gives info on the province selected. A guessing bar is provided at the bottom that can be used to enter a guess. The standard game features a 5 round system, with each round giving a score of 0-1000 inclusive, and the final score being the sum of all out of 5000.

##### Sub-feature: Province-based Division
<img width="1238" height="478" alt="image" src="https://github.com/user-attachments/assets/e019f10e-68b3-485a-9128-3ca0205e6f5a" />
The top bar has a toggleable "Border" option that displays the borders of the map's provinces by which the map is internally divided into. The same section also includes the "Label" toggle which can turn on and off the text labels that hover over the provinces, as well as the "Markers" toggle, which we will go in more depth later as it is experimental at the moment and turned off by default.

##### Sub-feature: Province Information Panel
<img width="272" height="273" alt="image" src="https://github.com/user-attachments/assets/e76e73cc-ffb3-4ca8-aee9-ac025dde3d9c" />

The top right info panel appears when hovering over a province, and it gives a lot of info on the province, such as its name, ruler, religion, culture and capital. It can be useful to know the differences within the same ruler region on a province level.

##### Sub-feature: Markers (Experimental)
<img width="1401" height="661" alt="image" src="https://github.com/user-attachments/assets/d0a726ea-e147-4eb0-9988-4acd79da3008" />

The marker toggle, which is disabled on default, is an experimental feature added that will be developed for full integration later. It places dots around the map with an important event or figure attached to it in association to the time period. They are meant to give hints or context on to the world state currently. However, the issue is, in more modern times, the number of markers is ramped up significantly and can cause severe performance issues. This will be fixed soon

##### Sub-feature: Color Schemes (Ruler/Religion/Culture)
<img width="1248" height="578" alt="image" src="https://github.com/user-attachments/assets/9b1e8542-6bf0-42a9-b5fd-44e9edcd1b4a" />

The top bar of the map has toggle to change the coloring scheme from the ruler to religion or culture. The coloring is on a province-to-province basis, and is useful for seeing differences within a ruler region in terms of its religion and cultural divisions as well as seeing the spread of cultures or religions on a macro scale to infer the time. This is where the province based division system is really helpful, as we can assign the provinces three different color with different keys rather than having to make compplex shapfiles for each.

In Borderline, a ruler is defined as having a millitary or primary official governmental power over the region. This rule is broken when major states are set up as a seperate entity on purpose, such as Vichy France, which, while an independant ruler, was still under major governmental influence of Nazi Gernmany. A Religion as defined by the spiritual belief of the province. The culture is defined by the collective sense of community by the people. For example, a multi-cultural country like China can have one ruler, but have under it many divisions in terms of culture, such as the Cantonese and the Sichuanese.

### Explore mode
<img width="1917" height="922" alt="image" src="https://github.com/user-attachments/assets/5f9a95cf-a156-4a30-9012-5bab6391e4bf" />

The Explore Mode is essentially a "Practice Mode" or a "dictionary" for the maps, where you can explore the rulers, religions and cultures of the whole world at any selected year. This is useful for studying a specific time period or take a look at will. It essentially contains everything the game mode does except the ability to submit a guess.

### Leaderboard 
<img width="762" height="287" alt="image" src="https://github.com/user-attachments/assets/51c8bd9b-4deb-4772-9c88-8285d03127df" />

The leaderboard ranks all players based on their highest scored game, with also a display of their averages


### Game History
<img width="816" height="616" alt="image" src="https://github.com/user-attachments/assets/1e4e6ec3-4cf4-4039-8933-506fb0cfeb38" />

The game history section will show a list of all past games and its scores, which are expandable to see the guesses on a round by round basis

### Profile
The profile section includes social details and stats for each player. This is a personal addition to the MapGuessr, as it did not have customization as such.

##### Sub-feature: Quick Stats
<img width="1341" height="203" alt="image" src="https://github.com/user-attachments/assets/a136f215-349a-4edc-b5bc-52a89cc5640d" />
At the top of the page, it displays the number of games, average score and higehst score as quick stats

##### Sub-feature: Profile Customization
<img width="975" height="910" alt="image" src="https://github.com/user-attachments/assets/39c79a1a-eb1f-402a-b36a-d847ec418329" />

The user can customize their profile to include their favorite time period, ruler and province that will be displayed in an interactable map.

##### Sub-feature: Performance by Century
<img width="922" height="281" alt="image" src="https://github.com/user-attachments/assets/aa5c351f-7bf6-49e4-a266-d883ec1367c6" />

This shows a bar for every century representing the average score they get when guessing in this time period

##### Sub-feature: Performance over Time
<img width="916" height="367" alt="image" src="https://github.com/user-attachments/assets/50a1a2bf-f8f0-463a-978e-9d68a0f073f7" />

This shows the game scores as a function of time

##### Sub-feature: History
<img width="947" height="687" alt="image" src="https://github.com/user-attachments/assets/5cf7354c-e7a3-43b6-b8d1-288709583c61" />

Extremely similar to the previous game history page, this one is nicer. Paginated, allowable to sort and also expandable by round basis as before.
