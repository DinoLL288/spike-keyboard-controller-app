#!/usr/bin/env python3
"""SPIKE Block Studio + Keyboard Controller -- a SHORT class deck.
Only covers:
  1. what the two apps DO
  2. how to get them (2 ways: browser link / one-line install)
  3. a brief description of how they work
Anything the LEGO SPIKE Education app already does is intentionally left out.
Regenerate with:  ./.venv/bin/python build_deck.py
"""
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import MSO_AUTO_SIZE

# ---- palette ---------------------------------------------------------------
NAVY   = RGBColor(0x1A, 0x1F, 0x3B)
NAVY2  = RGBColor(0x22, 0x28, 0x48)
BLUE   = RGBColor(0x00, 0x90, 0xF5)
GREEN  = RGBColor(0x00, 0xB9, 0x4D)
PINK   = RGBColor(0xFF, 0x4C, 0xCD)
PURPLE = RGBColor(0x9B, 0x6A, 0xF6)
ORANGE = RGBColor(0xF5, 0xC4, 0x02)
RED    = RGBColor(0xFF, 0x5D, 0x64)
TEAL   = RGBColor(0x3F, 0xCC, 0xF1)
SOUND  = RGBColor(0xC0, 0x61, 0xF1)
CTRL   = RGBColor(0xFF, 0xB5, 0x15)
VARB   = RGBColor(0xFF, 0x98, 0x35)
KEYB   = RGBColor(0x60, 0x7D, 0x8B)
MINT   = RGBColor(0x2E, 0xCC, 0xA7)
WHITE  = RGBColor(0xFF, 0xFF, 0xFF)
GRAY   = RGBColor(0xCC, 0xCC, 0xCC)
LGRAY  = RGBColor(0xF0, 0xF0, 0xF0)
LGRAY2 = RGBColor(0xBB, 0xBB, 0xBB)
EMOJI  = 'Apple Color Emoji'
FONT   = 'Avenir Next'

prs = Presentation()
prs.slide_width  = Inches(13.333)
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]


def set_bg(slide, colour):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = colour


def add_text(slide, left, top, width, height, text, size=18, bold=False,
             colour=WHITE, align=PP_ALIGN.LEFT, font=FONT):
    box = slide.shapes.add_textbox(Inches(left), Inches(top),
                                   Inches(width), Inches(height))
    tf = box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = colour
    run.font.name = font
    return tf


def add_bullets(slide, left, top, width, height, items, size=16,
                colour=WHITE, spacing=6, emoji_size=22):
    box = slide.shapes.add_textbox(Inches(left), Inches(top),
                                   Inches(width), Inches(height))
    tf = box.text_frame
    tf.word_wrap = True
    for i, (emoji, line) in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(spacing)
        p.alignment = PP_ALIGN.LEFT
        if emoji:
            r1 = p.add_run()
            r1.text = emoji + '  '
            r1.font.size = Pt(emoji_size)
            r1.font.color.rgb = WHITE
            r1.font.name = EMOJI
        r2 = p.add_run()
        r2.text = line
        r2.font.size = Pt(size)
        r2.font.color.rgb = colour
        r2.font.name = FONT
    return tf


def _rounded(shape, radius):
    spPr = shape._element.spPr
    prstGeom = spPr.find(qn('a:prstGeom'))
    avLst = prstGeom.find(qn('a:avLst'))
    if avLst is None:
        avLst = spPr.makeelement(qn('a:avLst'), {})
        prstGeom.append(avLst)
    for gd in list(avLst):
        avLst.remove(gd)
    avLst.append(spPr.makeelement(qn('a:gd'),
                  {'name': 'adj', 'fmla': 'val %d' % int(radius * 50000)}))


def draw_box(slide, left, top, w, h, fill, text='', text_size=11,
             text_colour=WHITE, radius=0.15, font=FONT):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE,
                                    Inches(left), Inches(top),
                                    Inches(w), Inches(h))
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    shape.line.fill.background()
    _rounded(shape, radius)
    tf = shape.text_frame
    tf.word_wrap = True
    tf.margin_left = Pt(4); tf.margin_right = Pt(4)
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = text
    run.font.size = Pt(text_size); run.font.bold = True
    run.font.color.rgb = text_colour; run.font.name = font
    return shape


def add_code(slide, left, top, w, h, text, size=13, colour=WHITE,
             bg=NAVY2, radius=0.15):
    back = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE,
                                   Inches(left - 0.15), Inches(top - 0.12),
                                   Inches(w + 0.3), Inches(h + 0.24))
    back.fill.solid(); back.fill.fore_color.rgb = bg
    back.line.fill.background()
    _rounded(back, radius)
    box = slide.shapes.add_textbox(Inches(left), Inches(top),
                                   Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.LEFT
    run = p.add_run()
    run.text = text
    run.font.size = Pt(size); run.font.bold = False
    run.font.color.rgb = colour; run.font.name = 'Menlo'
    return tf


def arrow_right(slide, x, y, w=1.1, h=0.35, fill=LGRAY):
    shape = slide.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW,
                                    Inches(x), Inches(y),
                                    Inches(w), Inches(h))
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    shape.line.fill.background()


def add_table(slide, left, top, col_widths, rows, header_bg=BLUE,
              header_fg=WHITE, body_bg=WHITE, body_fg=NAVY, size=13):
    n_rows, n_cols = len(rows), len(col_widths)
    shape = slide.shapes.add_table(n_rows, n_cols,
                                   Inches(left), Inches(top),
                                   Inches(sum(col_widths)),
                                   Inches(0.35 * n_rows))
    table = shape.table
    for i, w in enumerate(col_widths):
        table.columns[i].width = Inches(w)
    for ri, row in enumerate(rows):
        for ci, val in enumerate(row):
            cell = table.cell(ri, ci)
            cell.text = val
            p = cell.text_frame.paragraphs[0]
            p.alignment = PP_ALIGN.LEFT
            run = p.runs[0] if p.runs else p.add_run()
            run.font.size = Pt(size)
            run.font.bold = (ri == 0)
            if ri == 0:
                cell.fill.solid()
                cell.fill.fore_color.rgb = header_bg
                run.font.color.rgb = header_fg
            else:
                cell.fill.solid()
                cell.fill.fore_color.rgb = LGRAY if ri % 2 == 0 else WHITE
                run.font.color.rgb = body_fg
            run.font.name = FONT
    return shape


# ============================================================================
# SLIDE 1 - TITLE
# ============================================================================
sl = prs.slides.add_slide(BLANK); set_bg(sl, NAVY)
add_text(sl, 0.5, 0.4, 12, 0.7, 'SPIKE Block Studio + Keyboard Controller', 40, True, WHITE)
add_text(sl, 0.5, 1.3, 12, 0.6, 'Two tiny apps that talk to your LEGO SPIKE hub - without touching the LEGO app.', 18, False, LGRAY)
add_text(sl, 0.5, 2.3, 12, 0.9, 'Block Studio', 26, True, BLUE)
add_bullets(sl, 0.8, 3.3, 11.5, 0.5, [
    ('', 'Drag-and-drop Blockly editor -- make programs, run them on the hub'),
], 15, WHITE, 4)
add_text(sl, 0.5, 4.此次活动, 12, 0.9, 'Keyboard Controller', 26, True, GREEN)
add_bullets(sl, 0.8, 5.2, 11.5, 0.5, [
    ('', 'Drive your robot with the WASD keys -- no tapping, just typing'),
], 15, WHITE, 4)
add_text(sl, 0.5, 6.7, 12, 0.5, 'All offline. No cloud. No account.', 14, False, LGRAY2)

# ============================================================================
# SLIDE 2 - WHAT BLOCK STUDIO DOES
# ============================================================================
sl = prs.slides.add_slide(BLANK); set_bg(sl, NAVY)
add_text(sl, 0.5, 0.4, 12, 0.7, 'What Block Studio Does', 34, True, WHITE)
add_bullets(sl, 0.6, 1.5, 12, 3.5, [
    ('\U0001F9E9', 'A block editor that runs right on your Mac - drag pieces together'),
    ('\U0001F511', 'Adds a "keyboard" block (W A S D) the LEGO app does NOT have'),
    ('\U0001F916', 'Runs your program live on the hub, straight from the editor'),
    ('\U0001F4BE', 'Saves and opens your projects as .llsp3 files'),
    ('\U0001F30D', 'Works in the browser (any Mac) or as a desktop app - same blocks'),
    ('\U0001F3E1', 'Runs locally, works offline after a one-time setup'),
], 16, WHITE, 8)

# ============================================================================
# SLIDE 3 - WHAT KEYBOARD CONTROLLER DOES
# ============================================================================
sl = prs.slides.add_slide(BLANK); set_bg(sl, NAVY)
add_text(sl, 0.5, 0.4, 12, 0.7, 'What the Keyboard Controller Does', 34, True, WHITE)
add_bullets(sl, 0.6, 1.5, 12, 3.5, [
    ('\U0001F5A8', 'Turn your Mac keyboard into a game pad for the robot'),
    ('\U0001F511', 'W A S D drive, Space stops, number keys 1-9 set speed'),
    ('\U0001F916', 'Sends each key press straight to the hub over Bluetooth'),
    ('\U0001F30D', 'One small desktop app - menu-bar friendly, works offline'),
    ('\U0001F3E1', 'You never need the LEGO app or the LEGO "remote" blocks'),
], 16, WHITE, 8)

# ============================================================================
# SLIDE 4 - HOW THEY WORK (BRIEF)
# ============================================================================
sl = prs.slides.add_slide(BLANK); set_bg(sl, NAVY)
add_text(sl, 0.5, 0.4, 12, 0.7, 'How They Work (in one line each)', 34, True, WHITE)
add_text(sl, 0.5, 1.5, 12, 0.6, 'Block Studio  ->  blocks  ->  program  ->  Bluetooth  ->  SPIKE hub', 16, True, BLUE)
add_text(sl, 0.5, 2.4, 12, 0.6, 'Keyboard Controller  ->  wasd keys  ->  Bluetooth  ->  SPIKE hub', 16, True, GREEN)
add_text(sl, 0.5, 3.5, 12, 1.5, 'Both apps use the same trick:', 16, True, PURPLE)
add_bullets(sl, 0.6, 4.2, 12, 2.5, [
    ('\U0001F516', 'They talk to the hub the same way the LEGO app does - over Bluetooth (BLE)'),
    ('\U0001F312', 'No cloud, no account, no internet after setup - the program lives on the hub'),
    ('\U0001F527', 'Either app saves/opens .llsp3 files you can share with the class'),
], 15, WHITE, 6)

# ============================================================================
# SLIDE 5 - WAY 1: BROWSER (NO INSTALL)
# ============================================================================
sl = prs.slides.add_slide(BLANK); set_bg(sl, NAVY)
add_text(sl, 0.5, 0.4, 12, 0.7, 'Way 1 - In the Browser (no install)', 34, True, WHITE)
add_code(sl, 0.5, 1.6, 12, 0.7, 'https://dinoll288.github.io/spike-keyboard-controller/', 15, LGRAY2, NAVY2)
add_text(sl, 0.5, 2.7, 12, 0.5, 'Open this link, click Block Studio or Keyboard Controller, done.', 16, False, WHITE)
add_text(sl, 0.5, 3.7, 12, 0.5, 'Works in Chrome, Edge or Safari on any Mac in the room.', 14, False, LGRAY2)

# ============================================================================
# SLIDE 6 - WAY 2: ONE-LINE INSTALL
# ============================================================================
sl = prs.slides.add_slide(BLANK); set_bg(sl, NAVY)
add_text(sl, 0.5, 0.4, 12, 0.7, 'Way 2 - One-Line Install (macOS)', 34, True, WHITE)
add_text(sl, 0.5, 1.4, 12, 0.6, 'Open Terminal and paste this single line:', 18, False, WHITE)
add_code(sl, 0.3, 2.5, 12.7, 1.36,
         'bash -c "$(curl -fsSL https://raw.githubusercontent.com/DinoLL288/'
         'spike-keyboard-controller/main/release/python/install.sh)"', 16, WHITE, NAVY2)
add_bullets(sl, 0.6, 4.4, 12, 2.5, [
    ('\U0001F513', 'Installs both apps to ~/Documents/SPIKE_Apps'),
    ('\U0001F512', 'Clears the macOS quarantine so it opens with no warnings'),
    ('\U000023F3', 'Takes about a minute the first time, then runs offline'),
], 15, WHITE, 6)

# ============================================================================
# SLIDE 7 - FIRST RUN: WHAT MACOS ASKS (ONCE)
# ============================================================================
sl = prs.slides.add_slide(BLANK); set_bg(sl, NAVY)
add_text(sl, 0.5, 0.4, 12, 0.7, 'First Run - macOS asks twice (once)', 30, True, WHITE)
rows = [
    ['When', 'What it asks', 'What to do'],
    ['First launch', 'Keyboard access', 'Allow, so W A S D reaches your app'],
    ['First launch', 'Bluetooth', 'Allow, so it can find the SPIKE hub'],
]
add_table(sl, 0.5, 1.6, [3.0, 4.0, 6.5], rows, BLUE, WHITE, WHITE, NAVY, 13)
add_text(sl, 0.5, 4.6, 12, 0.8,
         'Both are normal and one-time. Every keyboard + Bluetooth app asks for them. '
         'No warnings about the app itself.', 14, False, LGRAY2)

# ============================================================================
# SLIDE 8 - LIVE DEMO / THANKS
# ============================================================================
sl = prs.slides.add_slide(BLANK); set_bg(sl, NAVY)
add_text(sl, 0.5, 0.4, 12, 0.7, 'Thanks!', 40, True, WHITE)
add_text(sl, 0.5, 1.6, 12, 0.6, 'Block Studio - blocks on your Mac, live on the hub.', 16, False, BLUE)
add_text(sl, 0.5, 2.4, 12, 0.6, 'Keyboard Controller - drive with WASD, no LEGO app.', 16, False, GREEN)
add_text(sl, 0.5, 3.8, 12, 0.6, 'Questions?', 22, True, PURPLE)
add_text(sl, 0.5, 4.6, 12, 0.6,
         'https://dinoll288.github.io/spike-keyboard-controller/', 16, False, LGRAY2)

out = '/Users/lukeligman/Documents/Default Project/spike_keyboard_controller/SPIKE_Block_Studio_Presentation.pptx'
prs.save(out)
print('Saved ->', out)
