import pandas as pd
from load import df
pd.set_option('display.width',250); pd.set_option('display.max_rows',500)
print(df[df.team=='Faltou'])
line=df[df.team.isin(['Branco','Azul','Preto'])&~df.is_gk]
gk=df[df.is_gk]
g=line.groupby('atleta').agg(dias=('dia','nunique'),gols=('gols','sum'),ast=('assist','sum'),zc=('zc','sum'),falta=('falta','sum')).reset_index()
g['gk_dias']=g.atleta.map(gk.groupby('atleta').dia.nunique()).fillna(0).astype(int)
g['zc_rate']=g.zc/g.dias; g['g_dia']=g.gols/g.dias; g['a_dia']=g.ast/g.dias
gkonly=gk.groupby('atleta').agg(gk_dias=('dia','nunique'),gsof=('gsof','sum'),vit=('vit','sum'),emp=('emp','sum')).reset_index()
print(g.sort_values('dias',ascending=False).round(2).to_string())
print(gkonly.sort_values('gk_dias',ascending=False).to_string())
print(line.groupby('dia').size().value_counts().sort_index())
print(gk.groupby('dia').size().value_counts())
