#!/usr/bin/env python3
import os

files = [
    'taxumio.ts', 'compliance.ts', 'consulting.ts', 
    'insurance.ts', 'realestate.ts', 'recruiting.ts', 'vc.ts'
]

# Each tuple: (EN badge, DE badge)
badge_map = {
    'taxumio.ts': ('Taxumio — the practice memory for tax & accounting', 'Taxumio — das Kanzleigedächtnis für Steuerberater & WP'),
    'compliance.ts': ('Compliumio — compliance memory, queryable', 'Compliumio — das Compliance-Gedächtnis, abfragbar'),
    'consulting.ts': ('Consultumio — the firm\'s institutional memory', 'Consultumio — das Institutional Memory der Beratung'),
    'insurance.ts': ('Versumio — the broker\'s client memory', 'Versumio — das Kunden-Gedächtnis des Maklers'),
    'realestate.ts': ('Immumio — the property lease memory', 'Immumio — das Mietvertrags-Gedächtnis der Immobilie'),
    'recruiting.ts': ('Talentumio — your proprietary talent graph', 'Talentumio — euer proprietärer Talent-Graph'),
    'vc.ts': ('Investumio — the fund\'s deal memory', 'Investumio — das Deal-Gedächtnis des Fonds'),
}

# Each tuple: (EN ctaSecondary, DE ctaSecondary)
cta_secondary_map = {
    'taxumio.ts': ('See how we compare', 'Vergleich ansehen'),
    'compliance.ts': ('Compare with GRC tools', 'Mit GRC-Tools vergleichen'),
    'consulting.ts': ('Compare with knowledge tools', 'Mit Wissenstools vergleichen'),
    'insurance.ts': ('Compare with agency tools', 'Mit Agentur-Tools vergleichen'),
    'realestate.ts': ('Compare with PM tools', 'Mit Verwaltungs-Tools vergleichen'),
    'recruiting.ts': ('Compare with search tools', 'Mit Search-Tools vergleichen'),
    'vc.ts': ('Compare with CRM tools', 'Mit CRM-Tools vergleichen'),
}

# Each tuple: (EN toolsSub, DE toolsSub)
tools_sub_map = {
    'taxumio.ts': ('Live pages in the Taxumio dashboard — no slides, no promises.', 'Live-Seiten im Taxumio-Dashboard — keine Folien, keine Versprechungen.'),
    'compliance.ts': ('Live compliance tools — not a slide deck.', 'Live-Compliance-Tools — kein Pitch-Deck.'),
    'consulting.ts': ('Live firm tools — not a pitch deck.', 'Live-Firmen-Tools — kein Pitch-Deck.'),
    'insurance.ts': ('Live agency tools — not a pitch deck.', 'Live-Agentur-Tools — kein Pitch-Deck.'),
    'realestate.ts': ('Live property tools — not a pitch deck.', 'Live-Immobilien-Tools — kein Pitch-Deck.'),
    'recruiting.ts': ('Live search tools — not a pitch deck.', 'Live-Search-Tools — kein Pitch-Deck.'),
    'vc.ts': ('Live fund tools — not a pitch deck.', 'Live-Fonds-Tools — kein Pitch-Deck.'),
}

# Each tuple: (EN faqTitle, DE faqTitle)
faq_title_map = {
    'taxumio.ts': ('Questions from the practice', 'Fragen aus der Kanzlei'),
    'compliance.ts': ('Questions from compliance officers', 'Fragen von Compliance-Officern'),
    'consulting.ts': ('Questions from consulting teams', 'Fragen von Beratungsteams'),
    'insurance.ts': ('Questions from insurance brokers', 'Fragen von Versicherungsmaklern'),
    'realestate.ts': ('Questions from property managers', 'Fragen von Hausverwaltern'),
    'recruiting.ts': ('Questions from search consultants', 'Fragen von Search-Beratern'),
    'vc.ts': ('Questions from investment teams', 'Fragen von Investment-Teams'),
}

base = '/Users/msc/subsumio-web/src/content/'

for fname in files:
    path = os.path.join(base, fname)
    with open(path, 'r') as f:
        content = f.read()
    
    en_badge, de_badge = badge_map[fname]
    en_cta, de_cta = cta_secondary_map[fname]
    en_tools, de_tools = tools_sub_map[fname]
    en_faq, de_faq = faq_title_map[fname]
    
    brand = fname.replace('.ts', '').capitalize()
    if brand == 'Taxumio': brand = 'Taxumio'
    if brand == 'Vc': brand = 'Investumio'
    if brand == 'Realestate': brand = 'Immumio'
    if brand == 'Recruiting': brand = 'Talentumio'
    
    # Determine actual brand name from file
    brand_en = {
        'taxumio.ts': 'Taxumio',
        'compliance.ts': 'Compliumio',
        'consulting.ts': 'Consultumio',
        'insurance.ts': 'Versumio',
        'realestate.ts': 'Immumio',
        'recruiting.ts': 'Talentumio',
        'vc.ts': 'Investumio',
    }[fname]
    
    # Replace EN badge (first occurrence only)
    old_en_badge = f'badge: "{brand_en} — powered by Subsumio"'
    new_en_badge = f'badge: "{en_badge}"'
    content = content.replace(old_en_badge, new_en_badge, 1)
    
    # Replace DE badge (second occurrence)
    content = content.replace(old_en_badge, f'badge: "{de_badge}"', 1)
    
    # Replace EN ctaSecondary
    content = content.replace('ctaSecondary: "Compare honestly"', f'ctaSecondary: "{en_cta}"', 1)
    # Replace DE ctaSecondary
    content = content.replace('ctaSecondary: "Ehrlich vergleichen"', f'ctaSecondary: "{de_cta}"', 1)
    
    # Replace EN toolsSub
    old_en_tools = 'toolsSub: "Every tile below is a live page in the dashboard — not a roadmap."'
    content = content.replace(old_en_tools, f'toolsSub: "{en_tools}"', 1)
    old_en_tools2 = 'toolsSub: "Every tile below is a live page in the Taxumio dashboard — not a roadmap."'
    content = content.replace(old_en_tools2, f'toolsSub: "{en_tools}"', 1)
    
    # Replace DE toolsSub
    old_de_tools = 'toolsSub: "Jede Kachel unten ist eine live Seite im Dashboard — keine Roadmap."'
    content = content.replace(old_de_tools, f'toolsSub: "{de_tools}"', 1)
    old_de_tools2 = 'toolsSub: "Jede Kachel unten ist eine live Seite im Taxumio-Dashboard — keine Roadmap."'
    content = content.replace(old_de_tools2, f'toolsSub: "{de_tools}"', 1)
    
    # Replace EN faqTitle
    content = content.replace('faqTitle: "Fair questions"', f'faqTitle: "{en_faq}"', 1)
    # Replace DE faqTitle
    content = content.replace('faqTitle: "Faire Fragen"', f'faqTitle: "{de_faq}"', 1)
    
    # Remove duplicate confidentiality phrases from EN sub
    content = content.replace(' Self-hosted or EU cloud, confidentiality-first.', '.', 1)
    
    # Remove duplicate confidentiality phrases from DE sub  
    content = content.replace(' Self-hosted oder EU-Cloud, Vertraulichkeit zuerst.', '.', 1)
    
    with open(path, 'w') as f:
        f.write(content)
    print(f'Processed {fname}')

print('All done')
