using UnityEngine;
using UnityEngine.UI;
using TMPro;

namespace Insimul.UI
{
    /// <summary>
    /// Opens when player interacts with books/scrolls, showing TextIR content with
    /// TextMeshPro pagination (previous/next page buttons). Rules panel: scrollable
    /// list of active world rules. Composition writing UI with TMP_InputField.
    /// </summary>
    public class DocumentReadingPanel : MonoBehaviour
    {
        [Header("Reading UI")]
        public Canvas documentCanvas;
        public TextMeshProUGUI titleText;
        public TextMeshProUGUI bodyText;
        public TextMeshProUGUI pageNumberText;
        public Button prevPageButton;
        public Button nextPageButton;
        public Button closeButton;

        [Header("Composition UI")]
        public Canvas compositionCanvas;
        public TMP_InputField compositionInput;
        public Button submitButton;

        [Header("Settings")]
        public int charsPerPage = 800;

        private string _fullText;
        private string _title;
        private int _currentPage;
        private int _totalPages;
        private bool _isOpen;
        private System.Action<string> _onCompositionSubmit;

        public bool IsOpen => _isOpen;

        public static DocumentReadingPanel Instance { get; private set; }

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;

            if (documentCanvas != null) documentCanvas.gameObject.SetActive(false);
            if (compositionCanvas != null) compositionCanvas.gameObject.SetActive(false);

            if (prevPageButton != null) prevPageButton.onClick.AddListener(PrevPage);
            if (nextPageButton != null) nextPageButton.onClick.AddListener(NextPage);
            if (closeButton != null) closeButton.onClick.AddListener(Close);
            if (submitButton != null) submitButton.onClick.AddListener(SubmitComposition);
        }

        public void OpenDocument(string title, string content)
        {
            _title = title;
            _fullText = content;
            _currentPage = 0;
            _totalPages = Mathf.CeilToInt((float)content.Length / charsPerPage);
            if (_totalPages < 1) _totalPages = 1;

            if (titleText != null) titleText.text = title;
            UpdatePage();

            _isOpen = true;
            if (documentCanvas != null) documentCanvas.gameObject.SetActive(true);
            Debug.Log($"[Insimul] Document opened: {title} ({_totalPages} pages)");
        }

        public void OpenComposition(string prompt, System.Action<string> onSubmit)
        {
            _onCompositionSubmit = onSubmit;
            if (compositionCanvas != null) compositionCanvas.gameObject.SetActive(true);
            if (compositionInput != null)
            {
                compositionInput.text = "";
                compositionInput.placeholder.GetComponent<TextMeshProUGUI>().text = prompt;
                compositionInput.ActivateInputField();
            }
        }

        public void Close()
        {
            _isOpen = false;
            if (documentCanvas != null) documentCanvas.gameObject.SetActive(false);
            if (compositionCanvas != null) compositionCanvas.gameObject.SetActive(false);
        }

        public void NextPage()
        {
            if (_currentPage < _totalPages - 1)
            {
                _currentPage++;
                UpdatePage();
            }
        }

        public void PrevPage()
        {
            if (_currentPage > 0)
            {
                _currentPage--;
                UpdatePage();
            }
        }

        private void UpdatePage()
        {
            if (bodyText != null)
            {
                int start = _currentPage * charsPerPage;
                int length = Mathf.Min(charsPerPage, _fullText.Length - start);
                bodyText.text = _fullText.Substring(start, length);
            }

            if (pageNumberText != null)
                pageNumberText.text = $"Page {_currentPage + 1} / {_totalPages}";

            if (prevPageButton != null) prevPageButton.interactable = _currentPage > 0;
            if (nextPageButton != null) nextPageButton.interactable = _currentPage < _totalPages - 1;
        }

        private void SubmitComposition()
        {
            if (compositionInput == null) return;
            string text = compositionInput.text;
            if (string.IsNullOrWhiteSpace(text)) return;

            _onCompositionSubmit?.Invoke(text);
            Close();
        }

        private void Update()
        {
            if (!_isOpen) return;
            if (Input.GetKeyDown(KeyCode.Escape)) Close();
            if (Input.GetKeyDown(KeyCode.RightArrow)) NextPage();
            if (Input.GetKeyDown(KeyCode.LeftArrow)) PrevPage();
        }
    }
}
