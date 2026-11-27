// Known New Eden solar systems containing permanent/recurring Ice Belts (Highsec, Lowsec, Nullsec, Shattered)
export const KNOWN_ICE_SYSTEMS = new Set<string>([
  // Caldari / Forge / Lonetrek / Citadel
  'Aedald', 'Airaken', 'Akora', 'Alentene', 'Alikara', 'Anka', 'Antollare', 'Aokannitoh',
  'Aulbres', 'Balle', 'Bereye', 'Bourynes', 'Cistuvaert', 'Dodenvale', 'Enderailen',
  'Erila', 'Frarn', 'Geras', 'Grinacanne', 'Halaima', 'Halmah', 'Haras', 'Hasama',
  'Hentogaira', 'Iivinen', 'Ikoskio', 'Isanamo', 'Jakanerva', 'Josameto', 'Kaimon',
  'Kamio', 'Kausa', 'Keberz', 'Korama', 'Kuomi', 'Laurvier', 'Litiura', 'Lour',
  'Mahtista', 'Malkalen', 'Matyas', 'Maut', 'Mesybier', 'Niarja', 'Nomaa', 'Obanen',
  'Oipo', 'Okagaiken', 'Olo', 'Onnamon', 'Orien', 'Osmon', 'Otakod', 'Poinen',
  'Rancer', 'Reitsato', 'Sankkasen', 'Sasta', 'Sivala', 'Sotrentaira', 'Tama',
  'Torrinos', 'Tuomuta', 'Uedama', 'Ukkalen', 'Uotila', 'Urlen', 'Valklears',
  'Vuorrassi', 'Ylandoki',
  // Amarr / Domain / Tash-Murkon / Kor-Azor / Genesis / Kador
  'Agha', 'Ahbazon', 'Algasienan', 'Amarr', 'Anjedin', 'Aphend', 'Aphi', 'Arakor',
  'Ardishapur Prime', 'Asghed', 'Ashab', 'Assah', 'Attyn', 'Bapraya', 'Boranai',
  'Choonka', 'Dabrid', 'Dihra', 'Eba', 'Eredan', 'Fabin', 'Gaha', 'Gidali',
  'Hakonen', 'Harva', 'Hath', 'Hemin', 'Hibi', 'Hikkoken', 'Ihakana', 'Irnin',
  'Isid', 'Jark', 'Kador Prime', 'Kahah', 'Kamela', 'Karan', 'Kasi', 'Kattegaud',
  'Kazna', 'Kebi', 'Kemerk', 'Khabi', 'Kiainti', 'Kourmonen', 'Lashkai', 'Lossa',
  'Madirmilire', 'Mahrokht', 'Mishi', 'Moussou', 'Munory', 'Nafomeh', 'Nakri',
  'Nidupad', 'Nifflung', 'Nourvukaiken', 'Ordat', 'Pahineh', 'Pasha', 'Pator',
  'Paye', 'Pera', 'Raa', 'Raravoss', 'Sazre', 'Sendaya', 'Shintaht', 'Sosh',
  'Tadadan', 'Tararan', 'Teshkat', 'Thasinaz', 'Tzashrah', 'Uanim', 'Vehan',
  'Yona', 'Zaimeth', 'Zimse',
  // Gallente / Sinq Laison / Essence / Verge Vendor / Everyshore / Placid / Solitude
  'Aetree', 'Alachene', 'Alillere', 'Anckee', 'Athinard', 'Aunia', 'Auvergne',
  'Barmalie', 'Boillair', 'Botane', 'Brarel', 'Clellinon', 'Couster', 'Doussivitte',
  'Du Annes', 'Eglennaert', 'Erme', 'Foves', 'Gallente', 'Goinard', 'Haine',
  'Heydieles', 'Iffrue', 'Inghenges', 'Jel', 'Jolia', 'Lamadent', 'Lermireve',
  'Loes', 'Luminaire', 'Meunvon', 'Mirilene', 'Mormelot', 'Navula', 'Ney',
  'Odinesyn', 'Ouelletta', 'Pakhshi', 'Partod', 'Pemene', 'Perbhe', 'Poitot',
  'Rorsins', 'Sank', 'Schmaeel', 'Stacmon', 'Stegette', 'Thiarer', 'Tierijev',
  'Trosquesere', 'Usteli', 'Villore', 'Yvangier',
  // Minmatar / Heimatar / Metropolis / Molden Heath / Derelik
  'Abudban', 'Aeditide', 'Aldik', 'Altrinur', 'Ameinaka', 'Amamake', 'Anher',
  'Arnher', 'Arnstur', 'Auner', 'Austraka', 'Barkrik', 'Berta', 'Bogelek',
  'Brin', 'Eystur', 'Frerstorn', 'Gebuladi', 'Gelfiven', 'Girani-Fa', 'Gulmorogod',
  'Gyng', 'Hadozeko', 'Hek', 'Hrober', 'Isbrabata', 'Klingt', 'Klogori',
  'Konora', 'Kronsen', 'Lantorn', 'Lustrevik', 'Magiko', 'Nakugard', 'Nifflung',
  'Odatrik', 'Onga', 'Orgron', 'Orvolle', 'Pator', 'Rens', 'Resbroko', 'Roushzar',
  'Ryddinjorn', 'Sirekur', 'Sist', 'Skarkon', 'Tabbetzur', 'Teonusude', 'Todifrauan',
  'Tralasa', 'Trer', 'Uriok', 'Vard', 'Vullat', 'Yveve',
  // Nullsec notable ice systems
  '1DQ1-A', '319-3D', '4-07MU', '4-HWWF', '5ZXX-K', '6QBH-S', '7G-QIG', '8S28-3',
  'B-9C24', 'BWF-ZZ', 'C-J6MT', 'D-PNP9', 'E-VKJV', 'EC-P8R', 'FD-MLJ', 'G-0Q86',
  'GE-8JV', 'HED-GP', 'J-CIJV', 'KBP7-G', 'M-OEE8', 'MJ-5F9', 'N5Y-4N', 'O-VWPB',
  'P-ZMZV', 'Q-JQSG', 'R1O-GN', 'T5ZI-S', 'U-HVIX', 'VFK-IV', 'X-7OMU', 'Y-MPWL',
  'Z9PP-H'
]);

