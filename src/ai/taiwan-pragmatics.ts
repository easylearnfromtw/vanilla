/** Taiwan Mandarin conversational pragmatics. A contextual style guide, not a word substitution filter.
 * References in docs/taiwan-conversation.md. No claims about a user's age or identity.
 */
export type SpeechContext="professional"|"sensitive"|"casual"|"playful"|"general";
const professional=/(?:病歷|病例|診斷|治療|醫學|臨床|PubMed|論文|國考|藥物|手術|程式|程式碼|GitHub|API|技術|資料庫|SQL|財務|法規|契約|報價|履歷|正式|寫信|簡報|文件|研究|演算法)/i;
const sensitive=/(?:難過|憂鬱|悲傷|生病|急診|受傷|焦慮|崩潰|暈倒|自殺|家人過世|分手|被騙|霸凌|威脅|危險)/;
const playful=/(?:笑死|哈哈|ww+|XD|xD|😂|🤣|有夠|超扯|太扯|真假|真的假的|蛤|笑爛|破防|救命喔|ㄏㄏ)/i;
const casual=/(?:欸|耶|喔|啦|齁|蛤|好欸|對欸|可以啊|有點|蠻|滿|超|感覺|我覺得|不太|要不要|怎麼辦|幫我)/;
export function speechContext(question:string):SpeechContext{
 const q=question.slice(0,700);
 if(sensitive.test(q))return "sensitive";
 if(professional.test(q))return "professional";
 if(playful.test(q))return "playful";
 if(casual.test(q))return "casual";
 return "general";
}
export function taiwanSpeechInstruction(question:string,style:"light"|"balanced"|"close"="balanced"):string{
 const context=speechContext(question);
 const base="臺灣華語語用：使用繁體中文與臺灣常見稱呼（例如「影片」「網路」「軟體」「設定」「資料」「品質」「手機」「捷運」），避免刻意套用中國大陸客服文風。回覆用自然的短句和接話，必要時才用「欸、喔、啦、耶」等助詞，不能每段都放。不要把「蛤」「笑死」「呵呵」當成禮貌公式。";
 if(context==="professional")return base+"這是專業或技術情境：專有名詞、推理、證據及風險描述保持精準；不插入迷因、網路流行語、裝可愛的語尾。先說能做什麼及結果，再補充必要說明。";
 if(context==="sensitive")return base+"這是需要審慎的個人或安全議題：平實、有同理但不要開玩笑；不用「笑死」「超扯」等可能造成誤解的詞。";
 if(context==="playful")return base+"使用者先用了輕鬆的口語／笑點，可以稍微接住節奏，必要時使用一次自然的「真的有夠…」「對欸」等表達，但不要硬模仿流行語或刻意取笑。若對話突然變正式，立刻收斂。";
 if(context==="casual")return base+(style==="light"?"語氣自然就好，避免主動玩梗。":"保持像臺灣熟悉的同齡人自然聊天，不必每句都回「好的，以下為…」。對具體問題仍優先給答案。");
 return base+"一般問題以平實的臺灣繁體中文回答，不為了像年輕人而強塞短期迷因；尊重每位家庭成員不同的說話習慣。";
}
/** Domain terms are recognized for comprehension; not all should be emitted. */
export const TAIWAN_COLLOQUIAL_LEXICON=[
 {term:"欸",meaning:"吸引注意、同意或轉折，語氣視情境調整",use:"casual"},
 {term:"蛤",meaning:"驚訝、沒聽清楚，偶爾帶不滿；不能一律當玩笑",use:"understand-only"},
 {term:"笑死",meaning:"表示好笑、吐槽或反諷；要看上下文",use:"playful-only"},
 {term:"破防",meaning:"情緒防線被觸動，可能感動也可能受挫",use:"understand-only"},
 {term:"情勒",meaning:"情緒勒索的口語縮寫",use:"understand-only"},
 {term:"很雷",meaning:"表現很差、令人失望或踩到雷點",use:"casual"},
 {term:"盤",meaning:"被當冤大頭、花了不划算的錢",use:"understand-only"},
 {term:"尬",meaning:"尷尬、互動不自然",use:"casual"},
 {term:"真假／真的假的",meaning:"驚訝、求證，可能不是字面上的質疑",use:"casual"},
 {term:"朋朋",meaning:"朋友的親暱暱稱，只在適合的關係使用",use:"understand-only"},
 {term:"留友看",meaning:"社群留言讓朋友看見的簡語，情境性很強",use:"understand-only"},
 {term:"級分",meaning:"社群中對某事物高分評價的迷因用法，非普遍口語",use:"understand-only"}
] as const;
