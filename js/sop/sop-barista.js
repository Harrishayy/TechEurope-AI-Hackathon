// Default Barista SOP — built-in demo data

const DEFAULT_BARISTA_SOP = {
  title: "Espresso Making",
  role: "barista",
  steps: [
    {
      step: 1,
      action: "Remove the portafilter from the group head",
      look_for: "Portafilter being twisted and removed from the espresso machine",
      common_mistakes: "Forgetting to knock out old grounds first"
    },
    {
      step: 2,
      action: "Knock out used coffee grounds from the portafilter",
      look_for: "Portafilter being tapped against knock box or bin",
      common_mistakes: "Not fully emptying the basket"
    },
    {
      step: 3,
      action: "Rinse the group head with a short flush of water",
      look_for: "Water running briefly from the group head",
      common_mistakes: "Skipping this step, which can cause burnt taste"
    },
    {
      step: 4,
      action: "Place the portafilter under the grinder and grind a fresh dose",
      look_for: "Portafilter positioned under grinder spout, grounds filling the basket",
      common_mistakes: "Wrong grind size or over/under dosing — aim for about 18 grams"
    },
    {
      step: 5,
      action: "Level and distribute the grounds evenly in the basket",
      look_for: "Finger or distribution tool sweeping across the basket surface",
      common_mistakes: "Uneven distribution causes channeling during extraction"
    },
    {
      step: 6,
      action: "Tamp the grounds firmly and evenly with the tamper",
      look_for: "Tamper pressing straight down on the grounds with steady pressure",
      common_mistakes: "Tamping at an angle or with inconsistent pressure"
    },
    {
      step: 7,
      action: "Insert the portafilter into the group head and lock it in",
      look_for: "Portafilter being twisted and secured into the group head",
      common_mistakes: "Not locking fully, which causes leaks during extraction"
    },
    {
      step: 8,
      action: "Place a cup under the spouts and start the extraction",
      look_for: "Cup positioned under portafilter, machine extraction button pressed",
      common_mistakes: "Forgetting the cup or using the wrong cup size"
    },
    {
      step: 9,
      action: "Watch the extraction — aim for a 25 to 30 second pull",
      look_for: "Espresso flowing in a steady, honey-like stream into the cup",
      common_mistakes: "Too fast means under-extracted (sour), too slow means over-extracted (bitter)"
    },
    {
      step: 10,
      action: "Stop the extraction and present the finished espresso",
      look_for: "Full espresso shot in the cup with a layer of golden crema on top",
      common_mistakes: "Letting the shot run too long — stop when the stream turns pale and thin"
    }
  ]
};
