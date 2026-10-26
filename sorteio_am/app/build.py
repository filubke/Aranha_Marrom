import sys
import base64
S='./'
LOGO='data:image/jpeg;base64,'+base64.b64encode(open(S+'logo.jpg','rb').read()).decode()
d=open(S+'../dados/data.json',encoding='utf-8').read()
t=open(S+'app.tmpl.html',encoding='utf-8').read().replace('__DATA__',d)
open(S+'sorteio_artefato.html','w',encoding='utf-8').write(t)   # versão artifact (sem wrapper)
i=t.index('</style>')+len('</style>')
head,body=t[:i],t[i:]
head=head.replace('<title>','<meta name="description" content="Sorteio equilibrado dos times do sábado do Aranha Marrom">\n<meta name="theme-color" content="#4a2113">\n<link rel="icon" type="image/jpeg" href="'+LOGO+'">\n<title>',1)
reset='<style>:root{color-scheme:dark;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style>\n'
full='<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'+reset+head+'\n</head>\n<body>'+body+'\n</body>\n</html>\n'
import os
open(S+'../index.html','w',encoding='utf-8').write(full)
print(len(t),len(full))
