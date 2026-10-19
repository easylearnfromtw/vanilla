import {Email,Row,Column,ColumnLayouts,Heading,Paragraph,Button,renderToHtml,renderToJson} from "@unlayer/react-elements";
import {escapeEmailHtml,safeEmailLink,MAX_TEMPLATE_TEXT} from "./email-policy";
import {venusEmailTheme,recommendedVenusTheme,type VenusEmailThemeId} from "../venus/email-design";

export type EmailTemplateKind="invitation"|"newsletter"|"announcement";
export type EmailTemplateFields={brand:string;title:string;message:string;buttonText:string;buttonUrl:string;preheader?:string};
export type GeneratedEmail={design:Record<string,unknown>;html:string};

const palettes={
 invitation:{accent:"#b72d21",eyebrow:"YOU ARE INVITED",footer:"期待與你相見"},
 newsletter:{accent:"#1a4ac2",eyebrow:"MONTHLY LETTER",footer:"感謝訂閱"},
 announcement:{accent:"#1a1a1a",eyebrow:"OFFICIAL ANNOUNCEMENT",footer:"感謝您的關注"}
} as const;

export function buildEmailTemplate(kind:EmailTemplateKind,fields:EmailTemplateFields,visual:VenusEmailThemeId=recommendedVenusTheme(kind)):GeneratedEmail{
 const palette=palettes[kind];
 const theme=venusEmailTheme(visual);
 const title=fields.title.trim().slice(0,160)||"Vanilla Email Studio";
 const brand=fields.brand.trim().slice(0,100)||"VANILLA";
 const message=escapeEmailHtml(fields.message.slice(0,MAX_TEMPLATE_TEXT)).replace(/\r?\n/g,"<br />");
 const buttonText=fields.buttonText.trim().slice(0,80)||"了解更多";
 const link=safeEmailLink(fields.buttonUrl);
 const preview=escapeEmailHtml((fields.preheader||fields.message).trim().slice(0,110));
 const tree=(
  <Email backgroundColor={theme.page} contentWidth="600px">
   <Row layout={ColumnLayouts.OneColumn} backgroundColor={theme.page} padding="24px">
    <Column>
     <Paragraph html={escapeEmailHtml(brand.toUpperCase())} color={theme.accent} fontSize="14px"/>
    </Column>
   </Row>
   <Row layout={ColumnLayouts.OneColumn} backgroundColor={theme.surface} padding={theme.padding}>
    <Column>
     <Paragraph html={palette.eyebrow} color={theme.accent} fontSize="12px"/>
     {preview?<Paragraph html={preview} color={theme.muted} fontSize="13px"/>:null}
     <Heading fontSize={theme.titleSize} color={theme.heading}>{title}</Heading>
     <Paragraph html={message||"請在 Vanilla 編輯信件內容。"} color={theme.body} fontSize="16px"/>
     {link?<Button href={link} backgroundColor={theme.accent} color={theme.buttonText}>{buttonText}</Button>:null}
    </Column>
   </Row>
   <Row layout={ColumnLayouts.OneColumn} backgroundColor={theme.page} padding="20px">
    <Column>
     <Paragraph html={escapeEmailHtml(palette.footer)+" · "+escapeEmailHtml(brand)} color={theme.muted} fontSize="12px"/>
    </Column>
   </Row>
  </Email>
 );
 const design:unknown=renderToJson(tree);
 if(!design||typeof design!=="object"||Array.isArray(design))throw new Error("無法生成編輯器格式");
 return {design:design as Record<string,unknown>,html:renderToHtml(tree)};
}
