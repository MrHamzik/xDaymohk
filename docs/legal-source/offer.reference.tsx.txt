import type { Locale } from "@/lib/content";
import { finalClauses } from "./clauses";

/**
 * Public offer.
 *
 * Official text supplied by the rights holder.
 * Russian is the authoritative version; en / zh are translations provided
 * for convenience — see `legal.translationNotice`.
 */

export const offerBodies: Partial<Record<Locale, React.ReactNode>> = {
  ru: (
    <>
      <p>Байчаев Хамзат Рамзанович, действующий как физическое лицо с применением специального налогового режима «Налог на профессиональный доход» (далее — <strong>Администратор</strong>), размещает настоящую публичную оферту в соответствии со ст. 435 и 437 Гражданского Кодекса Российской Федерации (далее — <strong>Оферта</strong>) с предложением физическим и (или) юридическим лицам, действующим в лице представителя, заключить Договор на нижеследующих условиях:</p>

                <h2>1. Термины</h2>
                <p>1.1. В целях единого толкования и понимания, нижеприведенные термины используются в следующих значениях:</p>
                <ul>
                  <li><strong>1.1.1. Акцепт публичной оферты</strong> — полное и безоговорочное принятие Пользователем условий настоящей публичной Оферты.</li>
                  <li><strong>1.1.2. Договор</strong> — возмездное соглашение между Администратором и Пользователем, заключенное посредством Акцепта публичной Оферты.</li>
                  <li><strong>1.1.3. Пользователь</strong> — физическое лицо, заключившее с Администратором Договор на условиях, содержащихся в настоящей публичной Оферте.</li>
                  <li><strong>1.1.4. Сервис</strong> — веб-сайт, расположенный в сети Интернет по адресу: <a href="https://infernal-dash.vercel.app/">https://infernal-dash.vercel.app/</a>.</li>
                </ul>

                <h2>2. Предмет договора и общие положения</h2>
                <p><strong>2.1.</strong> Предметом договора является продажа цифровых товаров (внутриигровая валюта, косметика, DLC) и предоставление подписок на игровой сервис (Редактор уровней, Battle Pass). Также возможна продажа физического мерча через партнерский сервис.</p>
                <p><strong>2.2.</strong> Пользователь получает доступ к Сервису через доступ к персональному аккаунту.</p>
                <p><strong>2.3.</strong> Пользователь обязуется обновлять персональные данные, предоставленные при регистрации, в случае их изменения; обеспечивать сохранность персональных данных от доступа третьих лиц; не передавать в пользование свой персональный аккаунт и/или логин и пароль своего персонального аккаунта третьим лицам.</p>
                <p><strong>2.4.</strong> Пользователь предоставляет Администрации электронный адрес и пароль для регистрации персонального аккаунта Пользователя.</p>
                <p><strong>2.5.</strong> Пользователь на собственное усмотрение устанавливает логин и пароль персонального аккаунта. Выбирая пароль для персонального аккаунта, Пользователь самостоятельно обеспечивает его конфиденциальность и несет ответственность за его надежность (устойчивость к взлому).</p>
                <p><strong>2.6.</strong> Стороны не вправе ссылаться на незаключенность настоящего Договора при встречном предоставлении в порядке статьи 432 ГК РФ.</p>
                <p><strong>2.7.</strong> Новая редакция Договора (Оферты) вступает в силу в день ее опубликования.</p>

                <h2>3. Акцепт оферты</h2>
                <p><strong>3.1.</strong> Акцептом Договора Оферты является факт оплаты Пользователем Договора; конклюдентные действия Пользователя или любое взаимодействие Пользователя с функционалом Сервиса в любом объеме.</p>
                <p><strong>3.2.</strong> До Акцепта настоящей Оферты Пользователь обязуется ознакомиться с ее содержанием. При наличии каких-либо сомнений в толковании условий настоящей Оферты Пользователь вправе до совершения Акцепта обратиться к Администрации с письменным запросом, в том числе посредством сети интернет, иным способом, исходя из существа правоотношений, и в ином случае Пользователь не имеет право ссылаться на незнание Оферты, если иное не установлено императивными нормами законодательства РФ.</p>
                <p><strong>3.3.</strong> Администратор вправе по своему усмотрению создавать, изменять или отменять условия настоящей Оферты, если иное не предусмотрено императивными нормами законодательства РФ.</p>
                <p><strong>3.4.</strong> Администратор уведомляет Пользователя об изменении Оферты посредством отправки электронного письма на адрес электронной почты Пользователя.</p>
                <p><strong>3.5.</strong> Совершая Акцепт, Пользователь подтверждает свою полную дееспособность. Акцепт не может считаться совершенным в случае, если совершен недееспособным лицом, а также лицом, не достигшим возраста 18 лет (исключая случаи эмансипации). Риск совершения Акцепта недееспособным лицом или лицом, не достигшим совершеннолетия, лежит на законных представителях такого лица.</p>
                <p><strong>3.6.</strong> Администратор сообщает, что данная Оферта действует совместно с Политикой конфиденциальности и Согласием на получение рекламы, принимая условия настоящей Оферты, Пользователь также принимает все условия вышеперечисленных документов и подтверждает, что ознакомился с ними.</p>
                <p><strong>3.7.</strong> В случае если вышеперечисленные документы противоречат Оферте, приоритет следует отдавать условиям настоящей Оферты.</p>
                <p><strong>3.8.</strong> Оплата Договора Пользователем производится посредством сервиса приема платежей (платежной системы) в соответствии с информацией, представленной на соответствующих страницах (разделах) Сервиса Администратора. Пользователь Акцептом настоящей Оферты подтверждает также, что ознакомился с офертой, политикой конфиденциальности и иными документами сервиса приема платежей (платежной системы).</p>

                <h2>4. Финансовые условия</h2>
                <p><strong>4.1.</strong> Настоящие тарифы на цифровые товары и подписки в рамках игры включают в себя пакеты внутриигровой валюты, боевые пропуска, доступ к редактору уровней и загружаемый контент (DLC). Каждый тариф имеет фиксированную стоимость, которая отображается на странице магазина. Предоставление товаров и услуг считается полностью осуществленным и немедленным после подтверждения платежа платежной системой. К основным категориям продукта относятся игровая валюта, сезонные боевые пропуска, подписки на расширенный функционал и дополнительные пакеты контента.</p>
                <p><strong>4.2.</strong> Моментом исполнения обязательства Пользователя по уплате денежных средств в пользу Администрации считается момент поступления денежных средств на расчетный счет Администратора.</p>

                <h2>5. Срок действия договора</h2>
                <p><strong>5.1.</strong> Срок действия договора определяется типом приобретаемого товара или услуги:</p>
                <ol>
                  <li>Для разовых покупок (игровая валюта, скины, DLC, Прайм-статус) договор действует бессрочно с момента оплаты.</li>
                  <li>Для ежемесячных подписок (Батл-Пасс, Редактор уровней) договор действует в течение срока оплаченного периода и продлевается на новый период только после внесения пользователем новой оплаты (ручное продление) в соответствии с тарифами, указанными на сайте.</li>
                </ol>
                <p><strong>5.2.</strong> Расторжение (прекращение действия) настоящего Договора означает, в том числе, прекращение действия всех приложений, дополнительных соглашений и иных документов к нему, если иное не предусмотрено в соответствующих приложениях и дополнительных соглашениях (иных документах) к Договору.</p>
                <p><strong>5.3.</strong> Администрация вправе приостановить оказание услуг на время проведения регламентных технических работ и устранения неполадок. Срок приостановки должен быть разумным и не превышать 24 часа.</p>

                <h2>6. Ответственность сторон</h2>
                <p><strong>6.1.</strong> Исполнитель несет ответственность за неисполнение или ненадлежащее исполнение обязательств в соответствии с законодательством РФ, за исключением случаев, прямо оговоренных в договоре.</p>
                <p><strong>6.2.</strong> Исполнитель не предоставляет гарантии на достоверность информации, размещаемой пользователями на форумах, в чатах или в комментариях. Вся информация предоставляется пользователями на их собственный риск.</p>
                <p><strong>6.3.</strong> Исполнитель не несет ответственности за содержание и достоверность рекламных материалов, размещенных на Сайте, если такие материалы не были разработаны Исполнителем.</p>
                <p><strong>6.4.</strong> Ответственность Исполнителя по настоящему договору ограничена стоимостью оплаченных, но не оказанных услуг. Исполнитель не несет ответственности за упущенную выгоду или моральный вред.</p>
                <p><strong>6.5.</strong> Пользователь заверяет Администрацию о достоверности предоставленной информации.</p>
                <p><strong>6.6.</strong> Пользователь обязуется не использовать программное обеспечение (и иной код) для автоматизированного сбора информации и (или) взаимодействия с Сервисом, в ином случае Пользователь обязан возместить Администрации убытки, причиненные указанными действиями, в полном объеме.</p>
                <p><strong>6.7.</strong> Пользователю при взаимодействии с Администрацией обязуется не распространять информацию, которая направлена на пропаганду войны, разжигание национальной, расовой или религиозной ненависти и вражды, а также иной информации, за распространение которой предусмотрена уголовная или административная ответственность.</p>

                <h2>7. Разрешение споров</h2>
                <p><strong>7.1.</strong> Все споры и разногласия, возникающие между Пользователем и Исполнителем, разрешаются путем переговоров. В случае невозможности досудебного урегулирования спора, он подлежит рассмотрению в суде по месту нахождения Исполнителя (в соответствии с законодательством РФ). Все претензии должны быть направлены на электронную почту: <a href="mailto:support@infernal-dash.xyz">support@infernal-dash.xyz</a>.</p>

                <h2>8. Форс-мажорные обстоятельства</h2>
                <p><strong>8.1.</strong> Стороны освобождаются от ответственности за полное или частичное неисполнение обязательств по настоящему Договору в случае возникновения обстоятельств непреодолимой силы (форс-мажор), включая, но не ограничиваясь: стихийные бедствия, войны, эпидемии, забастовки, действия государственных органов, аварии на сетях связи, DDoS-атаки и сбои в работе серверного оборудования хостинг-провайдеров. Сторона, для которой создались такие обстоятельства, обязана уведомить другую сторону в течение 5 рабочих дней.</p>

                <h2>9. Заключительные положения</h2>
                <p><strong>9.1.</strong> В случае признания недействительным какого-либо положения настоящего Договора, остальные его положения не утрачивают своей силы.</p>
                <p><strong>9.2.</strong> Если иное прямо не предусмотрено Договором, ничто в Договоре не может пониматься как установление между Сторонами агентских отношений, отношений товарищества, отношений по совместной деятельности, отношений личного найма, либо каких-то иных отношений, прямо не предусмотренных Договором.</p>
                <p><strong>9.3.</strong> Обо всех изменениях своего местонахождения или банковских реквизитов, а равно других обстоятельствах, имеющих значение для надлежащего исполнения настоящего Договора, стороны обязаны извещать друг друга незамедлительно.</p>
                <p><strong>9.4.</strong> В случае изменения каких-либо сведений о Стороне в период действия настоящего Договора, такая Сторона обязуется уведомить об этом другую Сторону в течение 5 календарных дней, в противном случае, все связанные с отсутствием такого уведомления риски Сторона несет самостоятельно.</p>
                <p><strong>9.5.</strong> Принимая настоящую Оферту, Стороны подтверждают, что:</p>
                <ul>
                  <li>9.5.1. ознакомились с Договором и им понятны значения используемых в Договоре терминов, слов и выражений согласно их нормативно-правовому определению или толкованию, указанному в Договоре;</li>
                  <li>9.5.2. заключают Договор добровольно и согласны с его условиями;</li>
                  <li>9.5.3. имеют право на самостоятельное совершение сделки (в частности, заключение Договора) и действия, предусмотренные Договором.</li>
                </ul>

                <h2>10. Реквизиты Администрации</h2>
                <p><strong>Байчаев Хамзат Рамзанович</strong><br />
                <strong>Адрес:</strong> 366602, Респ. Чеченская, р-н. Ачхой-Мартановский, с. Самашки, ул. Заводская, д 28<br />
                <strong>Банковские реквизиты:</strong> БИК: 044525974, СЧЁТ: 40817810600009475891</p>

      {finalClauses.ru}
    </>
  ),

  en: (
    <>
      <p>Baychaev Khamzat Ramzanovich, acting as an individual under the special tax regime “Tax on Professional Income” (hereinafter — the <strong>Administrator</strong>), publishes this public offer in accordance with Articles 435 and 437 of the Civil Code of the Russian Federation (hereinafter — the <strong>Offer</strong>), proposing to individuals and (or) legal entities acting through a representative to conclude an Agreement on the following terms:</p>

      <h2>1. Definitions</h2>
      <p>1.1. For the purposes of uniform interpretation and understanding, the terms below are used with the following meanings:</p>
      <ul>
        <li><strong>1.1.1. Acceptance of the public offer</strong> — full and unconditional acceptance by the User of the terms of this public Offer.</li>
        <li><strong>1.1.2. Agreement</strong> — a paid agreement between the Administrator and the User, concluded by way of Acceptance of the public Offer.</li>
        <li><strong>1.1.3. User</strong> — an individual who has concluded an Agreement with the Administrator on the terms contained in this public Offer.</li>
        <li><strong>1.1.4. Service</strong> — the website located on the Internet at: https://infernal-dash.vercel.app/.</li>
      </ul>

      <h2>2. Subject of the agreement and general provisions</h2>
      <p>2.1. The subject of the agreement is the sale of digital goods (in-game currency, cosmetics, DLC) and the provision of subscriptions to the game service (Level editor, Battle Pass). Sale of physical merchandise through a partner service is also possible.</p>
      <p>2.2. The User obtains access to the Service through access to a personal account.</p>
      <p>2.3. The User undertakes to update the personal data provided at registration if it changes; to keep personal data safe from access by third parties; and not to transfer their personal account and/or the login and password of their personal account to third parties.</p>
      <p>2.4. The User provides the Administration with an email address and password for registering the User’s personal account.</p>
      <p>2.5. The User sets the login and password of the personal account at their own discretion. When choosing a password for the personal account, the User independently ensures its confidentiality and is responsible for its strength (resistance to compromise).</p>
      <p>2.6. The Parties may not invoke the non-conclusion of this Agreement where counter-performance has been rendered, pursuant to Article 432 of the Civil Code of the Russian Federation.</p>
      <p>2.7. A new version of the Agreement (Offer) enters into force on the day of its publication.</p>

      <h2>3. Acceptance of the offer</h2>
      <p>3.1. Acceptance of the Offer Agreement is the fact of payment by the User under the Agreement; implied actions of the User, or any interaction of the User with the functionality of the Service to any extent.</p>
      <p>3.2. Prior to Acceptance of this Offer, the User undertakes to review its contents. Should there be any doubt as to the interpretation of the terms of this Offer, the User is entitled, before performing Acceptance, to address a written request to the Administration, including via the Internet or by another means appropriate to the nature of the relationship; otherwise the User is not entitled to plead ignorance of the Offer, unless otherwise established by mandatory provisions of the legislation of the Russian Federation.</p>
      <p>3.3. The Administrator is entitled, at their discretion, to create, amend or cancel the terms of this Offer, unless otherwise provided by mandatory provisions of the legislation of the Russian Federation.</p>
      <p>3.4. The Administrator notifies the User of changes to the Offer by sending an email to the User’s email address.</p>
      <p>3.5. By performing Acceptance, the User confirms their full legal capacity. Acceptance cannot be deemed performed if it is made by a legally incapable person, or by a person under 18 years of age (excluding cases of emancipation). The risk of Acceptance being performed by a legally incapable person or by a minor rests with the legal representatives of such person.</p>
      <p>3.6. The Administrator advises that this Offer applies together with the Privacy Policy and the Consent to receive advertising; by accepting the terms of this Offer, the User also accepts all the terms of the aforementioned documents and confirms that they have reviewed them.</p>
      <p>3.7. Should the aforementioned documents contradict the Offer, priority shall be given to the terms of this Offer.</p>
      <p>3.8. Payment under the Agreement is made by the User through a payment acceptance service (payment system) in accordance with the information presented on the relevant pages (sections) of the Administrator’s Service. By Accepting this Offer, the User also confirms that they have reviewed the offer, privacy policy and other documents of the payment acceptance service (payment system).</p>

      <h2>4. Financial terms</h2>
      <p>4.1. These tariffs for digital goods and subscriptions within the game include packs of in-game currency, battle passes, access to the level editor and downloadable content (DLC). Each tariff has a fixed price displayed on the store page. The provision of goods and services is deemed fully performed and immediate upon confirmation of payment by the payment system. The main product categories are in-game currency, seasonal battle passes, subscriptions to extended functionality and additional content packs.</p>
      <p>4.2. The moment of performance of the User’s obligation to pay funds to the Administration is the moment the funds are credited to the Administrator’s settlement account.</p>

      <h2>5. Term of the agreement</h2>
      <p>5.1. The term of the agreement is determined by the type of goods or services purchased:</p>
      <ul>
        <li>For one-off purchases (in-game currency, skins, DLC, Prime status) the agreement is valid indefinitely from the moment of payment.</li>
        <li>For monthly subscriptions (Battle Pass, Level editor) the agreement is valid for the duration of the paid period and is renewed for a new period only after the user makes a new payment (manual renewal) in accordance with the tariffs stated on the website.</li>
      </ul>
      <p>5.2. Termination (cessation) of this Agreement also means the cessation of all annexes, supplementary agreements and other documents thereto, unless otherwise provided in the relevant annexes and supplementary agreements (other documents) to the Agreement.</p>
      <p>5.3. The Administration is entitled to suspend the provision of services for the duration of scheduled technical work and troubleshooting. The suspension period must be reasonable and must not exceed 24 hours.</p>

      <h2>6. Liability of the parties</h2>
      <p>6.1. The Contractor is liable for non-performance or improper performance of obligations in accordance with the legislation of the Russian Federation, except in cases expressly stipulated in the agreement.</p>
      <p>6.2. The Contractor provides no warranty as to the accuracy of information posted by users on forums, in chats or in comments. All such information is provided by users at their own risk.</p>
      <p>6.3. The Contractor is not liable for the content and accuracy of advertising materials placed on the Site if such materials were not developed by the Contractor.</p>
      <p>6.4. The Contractor’s liability under this agreement is limited to the value of services paid for but not rendered. The Contractor is not liable for lost profit or moral harm.</p>
      <p>6.5. The User warrants to the Administration the accuracy of the information provided.</p>
      <p>6.6. The User undertakes not to use software (or other code) for the automated collection of information and (or) interaction with the Service; otherwise the User is obliged to compensate the Administration in full for the losses caused by such actions.</p>
      <p>6.7. When interacting with the Administration, the User undertakes not to disseminate information aimed at propaganda of war, incitement of national, racial or religious hatred and enmity, or other information the dissemination of which entails criminal or administrative liability.</p>

      <h2>7. Dispute resolution</h2>
      <p>7.1. All disputes and disagreements arising between the User and the Contractor are resolved through negotiations. If pre-trial settlement of a dispute is impossible, it is subject to consideration by a court at the location of the Contractor (in accordance with the legislation of the Russian Federation). All claims must be sent to the email address: support@infernal-dash.xyz.</p>

      <h2>8. Force majeure</h2>
      <p>8.1. The Parties are released from liability for full or partial non-performance of obligations under this Agreement in the event of force majeure circumstances, including but not limited to: natural disasters, wars, epidemics, strikes, actions of state authorities, failures of communication networks, DDoS attacks and failures of the server equipment of hosting providers. The Party for which such circumstances have arisen is obliged to notify the other Party within 5 business days.</p>

      <h2>9. Final provisions</h2>
      <p>9.1. Should any provision of this Agreement be declared invalid, its remaining provisions shall not lose their force.</p>
      <p>9.2. Unless expressly provided otherwise by the Agreement, nothing in the Agreement may be construed as establishing between the Parties an agency relationship, a partnership, a joint activity relationship, an employment relationship, or any other relationship not expressly provided for by the Agreement.</p>
      <p>9.3. The parties are obliged to notify each other immediately of all changes to their location or bank details, as well as other circumstances material to the proper performance of this Agreement.</p>
      <p>9.4. Should any information about a Party change during the term of this Agreement, such Party undertakes to notify the other Party within 5 calendar days; otherwise the Party bears independently all risks associated with the absence of such notification.</p>
      <p>9.5. By accepting this Offer, the Parties confirm that they:</p>
      <ul>
        <li>9.5.1. have reviewed the Agreement and understand the meanings of the terms, words and expressions used in the Agreement according to their statutory definition or the interpretation given in the Agreement;</li>
        <li>9.5.2. conclude the Agreement voluntarily and agree with its terms;</li>
        <li>9.5.3. have the right to independently enter into the transaction (in particular, to conclude the Agreement) and to perform the actions provided for by the Agreement.</li>
      </ul>

      <h2>10. Details of the Administration</h2>
      <p>Baychaev Khamzat Ramzanovich
        <br />Address: 366602, Chechen Republic, Achkhoy-Martanovsky district, Samashki village, Zavodskaya street, 28
        <br />Bank details: BIC: 044525974, Account: 40817810600009475891</p>
      {finalClauses.en}
    </>
  ),

  zh: (
    <>
      <p>拜恰耶夫·哈姆扎特·拉姆扎诺维奇，以适用“职业收入税”特别税制的自然人身份行事（下称<strong>管理方</strong>），依据《俄罗斯联邦民法典》第 435 条和第 437 条发布本公开要约（下称<strong>要约</strong>），向自然人及（或）由代表行事的法人提出按以下条件订立协议：</p>

      <h2>1. 术语</h2>
      <p>1.1. 为统一解释与理解，下列术语按以下含义使用：</p>
      <ul>
        <li><strong>1.1.1. 接受公开要约</strong>— 用户对本公开要约条件的完全且无条件的接受。</li>
        <li><strong>1.1.2. 协议</strong>— 管理方与用户之间通过接受公开要约而订立的有偿协议。</li>
        <li><strong>1.1.3. 用户</strong>— 按照本公开要约所含条件与管理方订立协议的自然人。</li>
        <li><strong>1.1.4. 服务</strong>— 位于互联网地址 https://infernal-dash.vercel.app/ 的网站。</li>
      </ul>

      <h2>2. 协议标的与一般条款</h2>
      <p>2.1. 协议标的为销售数字商品（游戏内货币、外观、DLC）以及提供游戏服务订阅（关卡编辑器、战斗通行证）。亦可通过合作服务销售实体周边商品。</p>
      <p>2.2. 用户通过个人账户获得对服务的访问权限。</p>
      <p>2.3. 用户承诺：在注册时提供的个人数据发生变更时予以更新；保障个人数据不被第三方获取；不将其个人账户及／或个人账户的登录名和密码转交第三方使用。</p>
      <p>2.4. 用户向管理方提供电子邮箱地址和密码，用于注册用户个人账户。</p>
      <p>2.5. 用户自行设定个人账户的登录名和密码。在为个人账户选择密码时，用户自行保障其保密性，并对其强度（抗破解能力）负责。</p>
      <p>2.6. 依据《俄罗斯联邦民法典》第 432 条，在已作出对待给付的情况下，各方无权主张本协议未成立。</p>
      <p>2.7. 协议（要约）的新版本自公布之日起生效。</p>

      <h2>3. 要约的接受</h2>
      <p>3.1. 对要约协议的接受是指：用户依协议付款的事实；用户的默示行为，或用户以任何程度与服务功能进行的任何交互。</p>
      <p>3.2. 在接受本要约之前，用户承诺阅读其内容。若对本要约条款的解释存有任何疑问，用户有权在作出接受之前以书面形式向管理方提出询问，包括通过互联网或依法律关系性质采用的其他方式；否则用户无权以不知悉本要约为由进行抗辩，但俄罗斯联邦法律强制性规范另有规定的除外。</p>
      <p>3.3. 除俄罗斯联邦法律强制性规范另有规定外，管理方有权自行制定、修改或取消本要约的条款。</p>
      <p>3.4. 管理方通过向用户的电子邮箱发送电子邮件的方式，就要约的变更通知用户。</p>
      <p>3.5. 用户作出接受即确认其具有完全行为能力。若接受由无行为能力人，或未满 18 周岁者（经解除亲权者除外）作出，则不视为已作出接受。无行为能力人或未成年人作出接受的风险由该人的法定代理人承担。</p>
      <p>3.6. 管理方告知：本要约与隐私政策及广告接收同意书共同适用；用户接受本要约条款的同时，亦接受上述文件的全部条款，并确认已阅读上述文件。</p>
      <p>3.7. 若上述文件与本要约相抵触，应以本要约的条款为准。</p>
      <p>3.8. 用户依协议的付款，通过支付受理服务（支付系统）按管理方服务相应页面（栏目）所载信息完成。用户接受本要约的同时，亦确认已阅读支付受理服务（支付系统）的要约、隐私政策及其他文件。</p>

      <h2>4. 财务条款</h2>
      <p>4.1. 游戏内数字商品与订阅的现行资费包括：游戏内货币礼包、战斗通行证、关卡编辑器访问权限以及可下载内容（DLC）。每项资费均有在商店页面显示的固定价格。自支付系统确认付款起，商品与服务的提供即视为完全且即时履行。主要产品类别为：游戏内货币、赛季战斗通行证、扩展功能订阅以及附加内容礼包。</p>
      <p>4.2. 用户向管理方支付款项之义务的履行时点，为款项入账至管理方结算账户之时。</p>

      <h2>5. 协议有效期</h2>
      <p>5.1. 协议有效期由所购商品或服务的类型确定：</p>
      <ul>
        <li>对于一次性购买（游戏内货币、皮肤、DLC、Prime 身份），协议自付款之时起无限期有效。</li>
        <li>对于按月订阅（战斗通行证、关卡编辑器），协议在已付费期间内有效，且仅在用户按网站所载资费再次付款（手动续费）后方延长至新的期间。</li>
      </ul>
      <p>5.2. 本协议的解除（终止）亦意味着其全部附件、补充协议及其他文件的终止，但协议的相应附件与补充协议（其他文件）另有规定的除外。</p>
      <p>5.3. 管理方有权在实施例行技术维护和排除故障期间暂停提供服务。暂停期限应当合理，且不得超过 24 小时。</p>

      <h2>6. 各方责任</h2>
      <p>6.1. 除协议中明确约定的情形外，承办方依据俄罗斯联邦法律对不履行或不当履行义务承担责任。</p>
      <p>6.2. 承办方不对用户在论坛、聊天或评论中发布信息的真实性提供保证。所有此类信息均由用户自担风险提供。</p>
      <p>6.3. 若网站上刊载的广告材料并非由承办方制作，承办方不对该等材料的内容与真实性承担责任。</p>
      <p>6.4. 承办方依本协议承担的责任以已付费但未提供服务的价值为限。承办方不对可得利益损失或精神损害承担责任。</p>
      <p>6.5. 用户向管理方保证所提供信息的真实性。</p>
      <p>6.6. 用户承诺不使用软件（及其他代码）自动采集信息及／或与服务进行交互；否则用户应就该等行为造成的损失向管理方全额赔偿。</p>
      <p>6.7. 用户在与管理方交互时，承诺不传播旨在宣扬战争、煽动民族、种族或宗教仇恨与敌意的信息，以及传播将导致刑事或行政责任的其他信息。</p>

      <h2>7. 争议解决</h2>
      <p>7.1. 用户与承办方之间产生的一切争议与分歧，均通过协商解决。若无法通过诉前方式解决争议，则应提交承办方所在地法院审理（依据俄罗斯联邦法律）。所有主张应发送至电子邮箱：support@infernal-dash.xyz。</p>

      <h2>8. 不可抗力</h2>
      <p>8.1. 发生不可抗力情形时，各方免除对完全或部分不履行本协议义务的责任，包括但不限于：自然灾害、战争、疫情、罢工、国家机关的行为、通信网络事故、DDoS 攻击以及主机服务商服务器设备故障。发生上述情形的一方应在 5 个工作日内通知另一方。</p>

      <h2>9. 最终条款</h2>
      <p>9.1. 若本协议的任一条款被认定为无效，其余条款不因此失去效力。</p>
      <p>9.2. 除协议明确另有规定外，协议中的任何内容均不得被理解为在各方之间设立代理关系、合伙关系、共同经营关系、雇佣关系或协议未明确规定的任何其他关系。</p>
      <p>9.3. 各方应就其所在地或银行资料的一切变更，以及对适当履行本协议具有重要意义的其他情况，立即相互通知。</p>
      <p>9.4. 若一方的任何信息在本协议有效期内发生变更，该方承诺在 5 个日历日内通知另一方；否则因未作该等通知而产生的一切风险由该方自行承担。</p>
      <p>9.5. 各方接受本要约即确认：</p>
      <ul>
        <li>9.5.1. 已阅读协议，并理解协议中所用术语、词语和表述依其法律定义或协议中所载解释的含义；</li>
        <li>9.5.2. 系自愿订立协议并同意其条款；</li>
        <li>9.5.3. 有权独立实施该交易（特别是订立协议）及协议所规定的行为。</li>
      </ul>

      <h2>10. 管理方资料</h2>
      <p>拜恰耶夫·哈姆扎特·拉姆扎诺维奇
        <br />地址：366602，车臣共和国，阿奇霍伊-马尔坦区，萨马什基村，扎沃茨卡娅街 28 号
        <br />银行资料：BIC：044525974，账号：40817810600009475891</p>
      {finalClauses.zh}
    </>
  ),
};
