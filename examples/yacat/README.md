To run the example use the following command:

```
npm run yacat --mask '?a?a?a' --hash '$P$5ZDzPE45CLLhEx/72qt3NehVzwN2Ry/'
```

you can also try with a heavier password:

```
npm run yacat --mask '?a?a?a?a' --hash '$H$5ZDzPE45C.e3TjJ2Qi58Aaozha6cs30' --number-of-providers 4
```

or a lighter one:

```
npm run yacat --mask '?a?a' --hash '$P$5ZDzPE45CigTC6EY4cXbyJSLj/pGee0'
```
