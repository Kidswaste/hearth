(round 62, weekquest62) Fixtures for dev/weekquest-test.js. Times are relative to the Monday of the test's week, so the
files work in any week (the test turns them into real times):
  shows.json    showsync61-shaped shows: key, title, h (hours after Monday 00:00 local), venue {name, address, lat, lon},
                lineup, tickets, platforms, cancelled
  weather.json  Open-Meteo-shaped days: d (days after Monday, 0..7), rain (% chance), tmax (°C)
