# Lexicon attribution

`lexicon.bin` is generated from **WordNet 3.1**, a lexical database created by
the Cognitive Science Laboratory at Princeton University.

It contains, in a compact binary form:

- ~75,000 single-word lemmas
- their synsets and the hypernym ("is a kind of") relations between them
- one definition (gloss) per synset
- per-sense frequencies from WordNet's semantically tagged corpus

Regenerate it with:

```bash
npm install          # wordnet-db is a devDependency
npm run build:lexicon
```

The file is committed rather than generated at deploy time, because building it
needs the 35 MB `wordnet-db` package that production installs omit.

## WordNet 3.1 License

> This software and database is being provided to you, the LICENSEE, by
> Princeton University under the following license. By obtaining, using and/or
> copying this software and database, you agree that you have read, understood,
> and will comply with these terms and conditions.
>
> Permission to use, copy, modify and distribute this software and database and
> its documentation for any purpose and without fee or royalty is hereby
> granted, provided that you agree to comply with the following copyright
> notice and statements, including the disclaimer, and that the same appear on
> ALL copies of the software, database and documentation, including
> modifications that you make for internal use or for distribution.
>
> WordNet 3.1 Copyright 2011 by Princeton University. All rights reserved.
>
> THIS SOFTWARE AND DATABASE IS PROVIDED "AS IS" AND PRINCETON UNIVERSITY MAKES
> NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR IMPLIED. BY WAY OF EXAMPLE, BUT
> NOT LIMITATION, PRINCETON UNIVERSITY MAKES NO REPRESENTATIONS OR WARRANTIES OF
> MERCHANTABILITY OR FITNESS FOR ANY PARTICULAR PURPOSE OR THAT THE USE OF THE
> LICENSED SOFTWARE, DATABASE OR DOCUMENTATION WILL NOT INFRINGE ANY THIRD PARTY
> PATENTS, COPYRIGHTS, TRADEMARKS OR OTHER RIGHTS.
>
> The name of Princeton University or Princeton may not be used in advertising
> or publicity pertaining to distribution of the software and/or database.
> Title to copyright in this software, database and any associated
> documentation shall at all times remain with Princeton University and LICENSEE
> agrees to preserve same.
