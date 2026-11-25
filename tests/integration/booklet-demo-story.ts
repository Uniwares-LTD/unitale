// Authored sample content, opt-in for local previews. Never a live AI result.
export function demoStory(language: string) {
  const ar = language === "ar";
  return {
    title: ar ? "مينا وكلمة مرحبًا الشجاعة" : "Mina’s Brave Little Hello",
    notice: ar
      ? "هذه تجربة محلية بقصة ورسوم مُعدّة مسبقًا عن يوم مينا الأول في المدرسة. فكرتك وإجاباتك محفوظة؛ لا يتم استدعاء ذكاء اصطناعي مباشر."
      : "This local demo uses a prepared story and illustrations about Mina’s first school day. Your idea and answers are saved; no live AI is called.",
    summary: ar
      ? "تصل مينا إلى مدرستها الجديدة وهي مترددة. تساعد ليو في جمع أقلامه، ثم يصنعان عصفورًا ورقيًا معًا. تكتشف أن كلمة مرحبًا صغيرة قد تبدأ صداقة كبيرة."
      : "Mina arrives at her new school with a flutter in her tummy. When Leo drops his pencils, one small act of kindness leads to a paper bird, a brave hello, and the beginning of a friendship.",
    beats: ar
      ? [
          "خطوة مترددة عند بوابة المدرسة.",
          "مساعدة ليو في جمع أقلامه الملوّنة.",
          "صنع عصفور ورقي وقول مرحبًا.",
          "صديقان جديدان في حديقة المدرسة.",
        ]
      : [
          "A shy first step through the school gate.",
          "A small kindness when Leo spills his pencils.",
          "A paper bird and one brave little hello.",
          "Two new friends in the school garden.",
        ],
    pages: ar
      ? [
          "أمسكت مينا بحمالتي حقيبتها البرتقالية أمام بوابة المدرسة. كانت تسمع ضحكات الأطفال من الداخل، لكن كلمة مرحبًا اختبأت في حلقها. لمست العصفور الورقي في جيبها، ثم خطت خطوة صغيرة إلى الأمام.",
          "في ركن القراءة، تناثرت أقلام ليو على السجادة. ركعت مينا وجمعت قلمًا أزرق وآخر أصفر. قال ليو مبتسمًا: شكرًا! لم تكن مينا بحاجة إلى كلمات كثيرة لتبدأ شيئًا جميلًا.",
          "جلسا قرب النافذة يطويان ورقة ملوّنة. دلّها ليو على الجناح الأول، وأرته مينا كيف يطوى الذيل. رفعت عصفورها وقالت بهدوء: مرحبًا، أنا مينا. أجاب: وأنا ليو، هل نصنع واحدًا آخر؟",
          "عندما حان وقت العودة، انطلق العصفوران فوق رأسيهما في حديقة المدرسة. لم تتغير المدرسة، لكن مينا شعرت أنها تعرف الطريق الآن. أحيانًا تبدأ الصداقة بقلم نرفعه، وابتسامة، وكلمة مرحبًا شجاعة.",
        ]
      : [
          "Mina held the straps of her orange backpack at the school gate. She could hear children laughing inside, but her hello felt very small. She touched the paper bird in her pocket and took one brave little step.",
          "In the reading corner, Leo’s pencils tumbled across the rug. Mina knelt to help—a blue one, a yellow one, a bright green one. ‘Thank you!’ Leo smiled. Mina had found a way to be kind before she found her words.",
          "By the sunny window, they folded a colorful sheet of paper. Leo showed Mina a wing; Mina showed him a tail. She lifted her bird and whispered, ‘Hello. I’m Mina.’ ‘I’m Leo,’ he said. ‘Shall we make another?’",
          "At home time, two paper birds flew above the school garden. The school was the same, but it felt a little more like Mina’s place. Sometimes a friendship begins with a pencil, a smile, and one brave little hello.",
        ],
    artNote: ar
      ? "هذا الرسم من مجموعة التجربة المُعدّة مسبقًا. حُفظت ملاحظتك للمراجعة؛ التجربة المحلية لا تُنشئ رسمًا جديدًا تلقائيًا."
      : "This illustration is from the prepared demo set. Your change note is recorded for review; the local demo does not generate new artwork automatically.",
  };
}
