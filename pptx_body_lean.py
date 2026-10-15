# ═════════════════════════════════════════════════════════════════════════════
# 1 - TITLE
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK); set_bg(sl, NAVY)
add_text(sl, 0.5, 0.9, 12, 1.5,
         'Two SPIKE Apps I Wrote' + '\n' + 'What They Do + How to Install',
         44, True, WHITE)

add_text(sl, 0.5, 3.1, 12, 1.0,
         'Block Studio -- a block editor for the SPIKE hub.' + '\n'
         'Keyboard Controller -- drive the robot from your Mac keyboard.',
         18, False, LGRAY2)

draw_box(sl, 0.5, 4.4, 6.0, 1.2, BLUE,  'Block Studio', 16, WHITE, 0.25)
draw_box(sl, 6.9, 4.4, 6.0, 1.2, PURPLE, 'Keyboard Controller', 16, WHITE, 0.25)

# ═════════════════════════════════════════════════════════════════════════════
# 2 - WHAT THE KEYBOARD CONTROLLER DOES
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK); set_bg(sl, NAVY)
add_text(sl, 0.5, 0.4, 12, 0.7, 'Keyboard Controller', 36, True, BLUE)
add_bullets(sl, 0.5, 1.6, 6.2, 094, [
    ('', 'Drive with W A S D + Space to stop'),
    ('', 'Speed keys 1-9'),
    ('', 'Talks straight to the SPIKE hub over Bluetooth'),
    ('', 'Runs fully offline on your Mac'),
    ('', 'Nothing else to install - just the app'),
], 16, WHITE, 8)

rows = [
    ['Key', 'What It Does'],
    ['W',  'Drive forward'],
    ['S',  'Drive backward'],
    ['A',  'Turn left'],
    ['D',  'Turn right'],
    ['Space', 'Stop'],
    ['1-9',   'Speed 10%-90%'],
]
add_table(sl, 7.0, 1.6, [1.8, 4.6], rows, BLUE, WHITE, WHITE, NAVY, 13)

# ═════════════════════════════════════════════════════════════════════════════
# 3 - HOW IT WORKS (brief)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK); set_bg(sl, NAVY)
add_text(sl, 0.5, 0.4, 12, 0.7, "What's Under the Hood", 36, True, MINT)
add_bullets(sl, 0.5, 1.6, 12, 3.2, [
    ('', 'Your key press gets turned into a motor command'),
    ('', 'That command goes over Bluetooth to the hub'),
    ('', 'The hub turns the motors - no LEGO app needed'),
    ('', 'The same path works for Block Studio programs too'),
], 18, WHITE, 10)
add_text(sl, 0.5, 5.6, 12, 1.0,
         'Keyboard -> BLE -> SPIKE hub -> motors', 20, True, LGRAY2)

# ═════════════════════════════════════════════════════════════════════════════
# 4 - HOW TO INSTALL (browser)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK); set_bg(sl, NAVY)
add_text(sl, 0.5, 0.4, 12, 0.7, 'Way 1 - In the Browser', 36, True, BLUE)
add_text(sl, 0.5, 1.3, 12, 0.6,
         'No install, no download, no Terminal - just open the page.', 15, False, LGRAY2)
add_code(sl, 0.5, 2.1, 12, 0.9,
         'open https://dinoll288.github.io/spike-keyboard-controller/',
         16, BLUE, NAVY2)
add_bullets(sl, 0.5, 3.4, 12, 2.6, [
    ('', 'Pick Block Studio or Keyboard Controller'),
    ('', 'Press SCAN, choose your hub, CONNECT'),
    ('', 'Drive with WASD, or snap blocks and Run'),
    ('', 'Works in Chrome, Edge or Safari'),
], 16, WHITE, 8)

# ═════════════════════════════════════════════════════════════════════════════
# 5 - HOW TO INSTALL (one line)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK); set_bg(sl, NAVY)
add_text(sl, 0.5, 0.4, 12, 0.7, 'Way 2 - One-Line Install', 36, True, GREEN)
add_code(sl, 0.5, 1.5, 12,  steward图片,  -a,
         'bash -c "$(curl -fsSL https://raw.githubusercontent.com/DinoLL288/spike-keyboard-controller/main/release/python/install.sh)"',
         15, GREEN, NAVY2)
add_bullets(sl, 0.5, 3.2, 12, 3.0, [
    ('', 'Installs to ~/Documents/SPIKE_Apps'),
    ('', 'Double-click to launch - no Terminal each time'),
    ('', 'No macOS "cannot verify" warning - no quarantine'),
], 16, WHITE, 8)

# ═════════════════════════════════════════════════════════════════════════════
# 6 - FIRST RUN / THANK YOU
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK); set_bg(sl, NAVY)
add_text(sl, 0.5, 0.4, 12, 0.7, 'First Time', 36, True, ORANGE)
add_bullets(sl, 0.5, 1.6, 12, 2.6, [
    ('', 'Input Monitoring - so WASD can be read (one click)'),
    ('', 'Bluetooth - so it can find the hub (one click)'),
    ('', 'Both are normal, one-time permissions'),
], 16, WHITE, 8)
add_text(sl, 0.5, 4.6, 12, 1.2,
         "Thanks!" + '\n' + 'Questions welcome.', 32, True, MINT)
# 