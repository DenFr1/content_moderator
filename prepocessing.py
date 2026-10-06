import re


def preprocess(text: str) -> str | None:
    text = text.lower()
    text = re.sub(r"http(s)*://\S+", "", text)
    text = re.sub(r"\s+", " ", text)
    text = text.strip()
    if text == "":
        return None
    return text


if __name__ == "__main__":
    print(preprocess("ПРИВЕТ, КАК ДЕЛА?"))
    print(preprocess("привет     как   дела"))
    print(preprocess("Купи здесь https://youtube.com"))
    print(preprocess(""))
    print(preprocess("     "))
    print(preprocess("!!!"))
    print(preprocess("Привет https://youtube.com как дела"))