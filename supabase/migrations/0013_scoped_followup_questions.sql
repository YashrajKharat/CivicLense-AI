-- CivicLense 0013 — follow-up questions that fit the complaint
--
-- Two faults. Questions were duplicated, because the seed and migration 0011
-- both inserted them and nothing stopped it. And three of them were attached to
-- every category, so a report about an unhygienic food stall asked whether it
-- was blocking traffic — which is not a question anyone can sensibly answer,
-- and asking it makes the whole form look automated and thoughtless.
--
-- A follow-up question earns its place only when the answer changes what
-- happens. "Is it blocking the road" changes the priority of a pothole. It
-- means nothing for a dirty kitchen. So questions are now scoped to the
-- families of problem they actually belong to.

-- ============================================================
-- 1. Stop duplicates recurring
-- ============================================================
delete from complaint_followups
where question_id in (
  select id from followup_questions f
  where exists (
    select 1 from followup_questions g
    where g.prompt->>'en' = f.prompt->>'en'
      and g.category_id is not distinct from f.category_id
      and g.id < f.id
  )
);

delete from followup_questions f
where exists (
  select 1 from followup_questions g
  where g.prompt->>'en' = f.prompt->>'en'
    and g.category_id is not distinct from f.category_id
    and g.id < f.id
);

-- ============================================================
-- 2. Scope questions to the problems they suit
-- ============================================================
-- A question belongs to a set of category codes. Only one question stays truly
-- universal — how long something has been there matters everywhere.
alter table followup_questions
  add column if not exists applies_to text[],
  add column if not exists universal boolean not null default false;

-- Start clean: the old rows carried the wrong scoping by construction.
delete from complaint_followups;
delete from followup_questions;

-- ============================================================
-- 3. The one genuinely universal question
-- ============================================================
insert into followup_questions (category_id, position, universal, prompt, options) values
  (null, 1, true,
   '{"en":"How long has this been here?","hi":"यह कब से है?","mr":"हे किती दिवसांपासून आहे?"}',
   '[{"value":"today","label":{"en":"Since today","hi":"आज से","mr":"आजपासून"},"severity_delta":0},
     {"value":"week","label":{"en":"About a week","hi":"लगभग एक हफ्ता","mr":"साधारण एक आठवडा"},"severity_delta":5},
     {"value":"month","label":{"en":"A month or more","hi":"एक महीना या ज़्यादा","mr":"एक महिना किंवा जास्त"},"severity_delta":12},
     {"value":"unsure","label":{"en":"Not sure","hi":"पता नहीं","mr":"माहीत नाही"},"severity_delta":0}]');

-- ============================================================
-- 4. Roads, footpaths, obstructions — is it in the way, is it dangerous
-- ============================================================
insert into followup_questions (category_id, position, prompt, options)
select c.id, 2,
  '{"en":"Is it blocking people or traffic?","hi":"क्या इससे लोगों या ट्रैफ़िक को रुकावट है?","mr":"यामुळे लोकांना किंवा वाहतुकीला अडथळा होतो आहे का?"}',
  '[{"value":"no","label":{"en":"No","hi":"नहीं","mr":"नाही"},"severity_delta":0},
    {"value":"partly","label":{"en":"Partly","hi":"थोड़ा","mr":"थोडेसे"},"severity_delta":10},
    {"value":"fully","label":{"en":"Completely","hi":"पूरी तरह","mr":"पूर्णपणे"},"severity_delta":22}]'
from categories c
where c.code in ('POTHOLE','ROADCRACK','MANHOLE','FOOTPATH','ROADOBST','DEBRIS',
                 'TREEFALL','DEAD_TREE','HAWKER','ENCROACHMENT','PARKING','FLOOD');

insert into followup_questions (category_id, position, prompt, options)
select c.id, 3,
  '{"en":"Could someone be hurt by it?","hi":"क्या इससे किसी को चोट लग सकती है?","mr":"यामुळे कोणाला दुखापत होऊ शकते का?"}',
  '[{"value":"no","label":{"en":"Unlikely","hi":"शायद नहीं","mr":"बहुधा नाही"},"severity_delta":0},
    {"value":"maybe","label":{"en":"Possibly","hi":"शायद","mr":"कदाचित"},"severity_delta":14},
    {"value":"yes","label":{"en":"Yes — children or elderly pass here","hi":"हाँ — यहाँ बच्चे या बुज़ुर्ग आते-जाते हैं","mr":"होय — इथून मुले किंवा वृद्ध जातात"},"severity_delta":28}]'
from categories c
where c.code in ('POTHOLE','MANHOLE','FOOTPATH','EXPOSEDWIRE','DAMAGEDPOLE',
                 'TREEFALL','DEAD_TREE','ROADOBST','SIGNAL');

-- ============================================================
-- 5. Food and hygiene — what an inspector actually needs to know
-- ============================================================
insert into followup_questions (category_id, position, prompt, options)
select c.id, 2,
  '{"en":"Is food being prepared or served in the open?","hi":"क्या खाना खुले में बन या परोसा जा रहा है?","mr":"अन्न उघड्यावर तयार होत आहे किंवा दिले जात आहे का?"}',
  '[{"value":"covered","label":{"en":"No, it is covered","hi":"नहीं, ढका हुआ है","mr":"नाही, झाकलेले आहे"},"severity_delta":0},
    {"value":"partly","label":{"en":"Partly uncovered","hi":"कुछ हिस्सा खुला है","mr":"काही भाग उघडा आहे"},"severity_delta":12},
    {"value":"open","label":{"en":"Fully in the open","hi":"पूरी तरह खुले में","mr":"पूर्णपणे उघड्यावर"},"severity_delta":22}]'
from categories c where c.code in ('FOODSTALL','FOODSTORAGE');

insert into followup_questions (category_id, position, prompt, options)
select c.id, 3,
  '{"en":"Did you see flies, pests or rubbish nearby?","hi":"क्या पास में मक्खियाँ, कीड़े या कचरा दिखा?","mr":"जवळपास माश्या, कीड किंवा कचरा दिसला का?"}',
  '[{"value":"no","label":{"en":"No","hi":"नहीं","mr":"नाही"},"severity_delta":0},
    {"value":"some","label":{"en":"Some","hi":"कुछ","mr":"थोडे"},"severity_delta":12},
    {"value":"many","label":{"en":"A lot","hi":"बहुत","mr":"खूप"},"severity_delta":25}]'
from categories c where c.code in ('FOODSTALL','FOODSTORAGE');

insert into followup_questions (category_id, position, prompt, options)
select c.id, 4,
  '{"en":"Did anyone fall ill after eating here?","hi":"क्या यहाँ खाने के बाद कोई बीमार हुआ?","mr":"इथे खाल्ल्यानंतर कोणी आजारी पडले का?"}',
  '[{"value":"no","label":{"en":"Not that I know","hi":"मुझे नहीं पता","mr":"माहीत नाही"},"severity_delta":0},
    {"value":"heard","label":{"en":"I have heard so","hi":"सुना है","mr":"ऐकले आहे"},"severity_delta":20},
    {"value":"yes","label":{"en":"Yes, I know someone","hi":"हाँ, मैं किसी को जानता हूँ","mr":"होय, मला कोणी माहीत आहे"},"severity_delta":40}]'
from categories c where c.code in ('FOODSTALL','FOODSTORAGE');

-- ============================================================
-- 6. Waste and sanitation — how much, and is it spreading
-- ============================================================
insert into followup_questions (category_id, position, prompt, options)
select c.id, 2,
  '{"en":"How much is there?","hi":"कितना है?","mr":"किती आहे?"}',
  '[{"value":"small","label":{"en":"A small pile","hi":"थोड़ा सा","mr":"थोडासा ढीग"},"severity_delta":0},
    {"value":"bin","label":{"en":"An overflowing bin","hi":"भरा हुआ डिब्बा","mr":"भरलेला डबा"},"severity_delta":10},
    {"value":"spread","label":{"en":"Spread across the road or footpath","hi":"सड़क या फुटपाथ पर फैला हुआ","mr":"रस्ता किंवा फुटपाथवर पसरलेले"},"severity_delta":22}]'
from categories c where c.code in ('GARBAGE','DUMPING','DEBRIS','DEADANIMAL');

insert into followup_questions (category_id, position, prompt, options)
select c.id, 3,
  '{"en":"Is there a strong smell?","hi":"क्या तेज़ बदबू आ रही है?","mr":"तीव्र दुर्गंधी येते आहे का?"}',
  '[{"value":"no","label":{"en":"No","hi":"नहीं","mr":"नाही"},"severity_delta":0},
    {"value":"some","label":{"en":"Some","hi":"थोड़ी","mr":"थोडी"},"severity_delta":8},
    {"value":"strong","label":{"en":"Strong — hard to walk past","hi":"बहुत तेज़ — पास से गुज़रना मुश्किल","mr":"खूप तीव्र — जवळून जाणे कठीण"},"severity_delta":18}]'
from categories c where c.code in ('GARBAGE','DUMPING','DEADANIMAL','SEWAGE','URINATION','TOILET');

insert into followup_questions (category_id, position, prompt, options)
select c.id, 4,
  '{"en":"How close is the nearest home, school or food shop?","hi":"सबसे नज़दीक घर, स्कूल या खाने की दुकान कितनी दूर है?","mr":"जवळचे घर, शाळा किंवा खाद्यदुकान किती लांब आहे?"}',
  '[{"value":"far","label":{"en":"Some distance away","hi":"काफ़ी दूर","mr":"बऱ्यापैकी लांब"},"severity_delta":0},
    {"value":"near","label":{"en":"Just across the street","hi":"सड़क के उस पार","mr":"रस्त्याच्या पलीकडे"},"severity_delta":12},
    {"value":"adjacent","label":{"en":"Right next to it","hi":"बिल्कुल बगल में","mr":"अगदी शेजारी"},"severity_delta":24}]'
from categories c where c.code in ('GARBAGE','DUMPING','DEADANIMAL','SEWAGE','STAGNANT','MOSQUITO','URINATION');

-- ============================================================
-- 7. Water — is it still running, and how many people are affected
-- ============================================================
insert into followup_questions (category_id, position, prompt, options)
select c.id, 2,
  '{"en":"Is water still flowing?","hi":"क्या पानी अब भी बह रहा है?","mr":"पाणी अजूनही वाहत आहे का?"}',
  '[{"value":"stopped","label":{"en":"Stopped","hi":"रुक गया","mr":"थांबले"},"severity_delta":0},
    {"value":"slow","label":{"en":"Slowly","hi":"धीरे-धीरे","mr":"हळूहळू"},"severity_delta":10},
    {"value":"heavy","label":{"en":"Heavily — being wasted","hi":"तेज़ी से — पानी बर्बाद हो रहा है","mr":"जोरात — पाणी वाया जात आहे"},"severity_delta":24}]'
from categories c where c.code in ('LEAK','PIPELINE','CONTAMINATED','DAMP');

insert into followup_questions (category_id, position, prompt, options)
select c.id, 3,
  '{"en":"How many households does this affect?","hi":"इससे कितने घर प्रभावित हैं?","mr":"याचा किती घरांवर परिणाम होतो?"}',
  '[{"value":"few","label":{"en":"Just a few","hi":"कुछ ही","mr":"काहीच"},"severity_delta":0},
    {"value":"street","label":{"en":"The whole street","hi":"पूरी गली","mr":"संपूर्ण गल्ली"},"severity_delta":14},
    {"value":"area","label":{"en":"The whole area","hi":"पूरा इलाक़ा","mr":"संपूर्ण परिसर"},"severity_delta":28}]'
from categories c where c.code in ('NOWATER','PIPELINE','CONTAMINATED','FLOOD','DRAINBLOCK','SEWAGE');

-- ============================================================
-- 8. Lighting and electrical — darkness and live danger
-- ============================================================
insert into followup_questions (category_id, position, prompt, options)
select c.id, 2,
  '{"en":"How dark does the street get?","hi":"रात में गली कितनी अँधेरी हो जाती है?","mr":"रात्री रस्ता किती अंधारा होतो?"}',
  '[{"value":"lit","label":{"en":"Other lights cover it","hi":"दूसरी बत्तियाँ काफ़ी हैं","mr":"इतर दिवे पुरेसे आहेत"},"severity_delta":0},
    {"value":"dim","label":{"en":"Dim","hi":"मद्धम","mr":"अंधुक"},"severity_delta":8},
    {"value":"dark","label":{"en":"Completely dark","hi":"पूरी तरह अँधेरा","mr":"पूर्ण अंधार"},"severity_delta":20}]'
from categories c where c.code in ('STREETLIGHT','DAMAGEDPOLE');

insert into followup_questions (category_id, position, prompt, options)
select c.id, 3,
  '{"en":"Are any wires exposed or hanging low?","hi":"क्या कोई तार खुला या नीचे लटका है?","mr":"कोणतीही तार उघडी किंवा खाली लोंबते आहे का?"}',
  '[{"value":"no","label":{"en":"No","hi":"नहीं","mr":"नाही"},"severity_delta":0},
    {"value":"yes","label":{"en":"Yes","hi":"हाँ","mr":"होय"},"severity_delta":35}]'
from categories c where c.code in ('STREETLIGHT','DAMAGEDPOLE','EXPOSEDWIRE');

-- ============================================================
-- 9. Defacement and spitting — is it recurring
-- ============================================================
insert into followup_questions (category_id, position, prompt, options)
select c.id, 2,
  '{"en":"Does this keep happening at this spot?","hi":"क्या यहाँ बार-बार ऐसा होता है?","mr":"या ठिकाणी हे वारंवार घडते का?"}',
  '[{"value":"first","label":{"en":"First time I have noticed","hi":"पहली बार देखा","mr":"पहिल्यांदाच पाहिले"},"severity_delta":0},
    {"value":"sometimes","label":{"en":"Now and then","hi":"कभी-कभी","mr":"अधूनमधून"},"severity_delta":8},
    {"value":"daily","label":{"en":"Every day","hi":"रोज़","mr":"रोज"},"severity_delta":18}]'
from categories c where c.code in ('SPITTING','DEFACED','URINATION','DUMPING','HAWKER','PARKING','NOISE');

-- ============================================================
-- 10. Stray animals — is anyone in danger now
-- ============================================================
insert into followup_questions (category_id, position, prompt, options)
select c.id, 2,
  '{"en":"What is the animal doing?","hi":"जानवर की क्या हालत है?","mr":"प्राण्याची स्थिती काय आहे?"}',
  '[{"value":"calm","label":{"en":"Calm, not bothering anyone","hi":"शांत है, किसी को परेशान नहीं कर रहा","mr":"शांत आहे, कोणाला त्रास देत नाही"},"severity_delta":0},
    {"value":"injured","label":{"en":"Injured or unwell","hi":"घायल या बीमार","mr":"जखमी किंवा आजारी"},"severity_delta":22},
    {"value":"aggressive","label":{"en":"Aggressive towards people","hi":"लोगों पर हमलावर","mr":"लोकांवर आक्रमक"},"severity_delta":38}]'
from categories c where c.code in ('STRAY','DEADANIMAL');

-- A table-level UNIQUE constraint cannot contain an expression; only an index
-- can. And because category_id is nullable, plain NULL semantics would treat
-- every universal question as distinct from every other — so the one row that
-- most needs protecting from duplicates would have none. coalesce gives the
-- universal rows a shared key.
create unique index if not exists followup_prompt_unique
  on followup_questions (coalesce(category_id, -1), (prompt->>'en'));

-- ============================================================
-- 11. Selecting questions for a complaint
-- ============================================================
-- Universal first, then whatever is attached to that category. Nothing else is
-- offered, so a food complaint is never asked about traffic.
create or replace function questions_for_category(p_category int)
returns setof followup_questions
language sql stable as $$
  select * from followup_questions
  where active and (universal or category_id = p_category)
  order by universal desc, position, id;
$$;
