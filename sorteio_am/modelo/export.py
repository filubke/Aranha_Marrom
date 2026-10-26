import pandas as pd, numpy as np, json, itertools
from load import df
sk=pd.read_pickle('skills.pkl').set_index('atleta')
gk=pd.read_pickle('gk.pkl').set_index('atleta')
pos=pd.read_csv('../dados/posicoes_propostas.csv').set_index('Atleta')
code={'Zagueiro':'Z','Meia':'M','Atacante':'A','Goleiro':'G'}
line=df[df.team.isin(['Branco','Azul','Preto'])&~df.is_gk]
alldays=sorted(df.dia.unique())
last10=set(alldays[-10:]); last8=alldays[-8:]
rec=line[line.dia.isin(last10)].groupby('atleta').dia.nunique()
recg=df[df.is_gk&df.dia.isin(last10)].groupby('atleta').dia.nunique()
ult=df.groupby('atleta').dia.max()
# position offsets (days-weighted mean over players with >=5 days)
off={}
for c in 'ZMA':
    names=[a for a in pos.index if code[pos.loc[a,'Posição proposta']]==c and a in sk.index and sk.loc[a,'dias']>=5]
    w=sk.loc[names,'dias']; off[c]=float((sk.loc[names,'skill']*w).sum()/w.sum())
print('offsets',off)
roster=[]
for a in pos.index:
    c=code[pos.loc[a,'Posição proposta']]
    e={'n':a,'p':c,'conf':pos.loc[a,'Confiança'][0],'obs':'' if pd.isna(pos.loc[a,'Observação']) else pos.loc[a,'Observação']}
    if a in sk.index:
        base=off.get(c,0.0) if c!='G' else float(sk.loc[a,'skill'])*0
        e['r']=round(float(sk.loc[a,'skill'])-(off[c] if c in off else 0),2)
        e['s']=round(float(sk.loc[a,'sd']),2); e['d']=int(sk.loc[a,'dias'])
    else:
        e['r']=0.0; e['s']=1.2; e['d']=0
    if a in gk.index:
        e['gr']=round(float(gk.loc[a,'rating']),2); e['gs']=round(float(gk.loc[a,'sd']),2); e['gd']=int(gk.loc[a,'dias'])
        e['gp']=None if pd.isna(gk.loc[a,'gsof_pg']) else round(float(gk.loc[a,'gsof_pg']),2)
    else:
        e['gr']=0.0; e['gs']=1.5; e['gd']=0; e['gp']=None
    e['rec']=int(rec.get(a,0))+int(recg.get(a,0))
    e['ult']=ult[a].strftime('%d/%m/%Y') if a in ult.index else ''
    roster.append(e)
# pairs: last 8 saturdays same-team
pairs={}
for (d,t),g in line[line.dia.isin(last8)].groupby(['dia','team']):
    for a,b in itertools.combinations(sorted(g.atleta),2):
        k=a+'|'+b; pairs[k]=pairs.get(k,0)+1
meta={'ate':alldays[-1].strftime('%d/%m/%Y'),'sabados':int(len(alldays)),'validos':32,'noise':4.0,'off':{k:round(v,2) for k,v in off.items()},'r2':0.25}
json.dump({'roster':roster,'pairs':pairs,'meta':meta},open('../dados/data_modelo.json','w'),ensure_ascii=False)
print(len(roster),len(pairs),meta)
print(pd.DataFrame(roster).sort_values('rec',ascending=False).head(30)[['n','p','r','s','d','gr','rec']].to_string())
